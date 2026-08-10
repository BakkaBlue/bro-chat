//! 手写 PNG chunk 解析：SillyTavern 的 chara 数据在 `tEXt` chunk 里，
//! 值为 `chara\0<base64(JSON)>`。不用 png crate 的原因：
//! 只做 chunk 级透传（IDAT 等原样拷贝，CRC 不动），无损且兼容
//! 交错/多 IDAT 等怪卡；对像素永远不解码。

use base64::Engine as _;

use crate::error::{AppError, AppResult};

const PNG_SIG: [u8; 8] = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
const CHARA_KEYWORD: &[u8] = b"chara";

fn check_signature(png: &[u8]) -> AppResult<()> {
    if !png.starts_with(&PNG_SIG) {
        return Err(AppError::other("不是有效的 PNG 文件（签名不匹配）"));
    }
    Ok(())
}

/// 提取 PNG 中的 chara 文本（已 base64 解码的 JSON 字符串）
pub fn extract_chara(png: &[u8]) -> AppResult<Option<String>> {
    check_signature(png)?;
    let mut pos = PNG_SIG.len();
    while pos + 8 <= png.len() {
        let len = u32::from_be_bytes(png[pos..pos + 4].try_into().unwrap()) as usize;
        let chunk_type = &png[pos + 4..pos + 8];
        let data_start = pos + 8;
        let data_end = data_start + len;
        if data_end + 4 > png.len() {
            return Err(AppError::other("PNG chunk 数据越界"));
        }
        if chunk_type == b"tEXt" {
            let text = &png[data_start..data_end];
            if let Some(nul) = text.iter().position(|&b| b == 0) {
                if &text[..nul] == CHARA_KEYWORD {
                    let value = String::from_utf8_lossy(&text[nul + 1..]).into_owned();
                    return decode_chara_value(&value).map(Some);
                }
            }
        }
        if chunk_type == b"IEND" {
            break;
        }
        pos = data_end + 4; // 跳过 CRC
    }
    Ok(None)
}

/// 容忍 `data:application/json;base64,` 前缀（部分导出器会写）
pub fn decode_chara_value(value: &str) -> AppResult<String> {
    let b64 = value
        .strip_prefix("data:application/json;base64,")
        .unwrap_or(value);
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64.trim())
        .map_err(|e| AppError::other(format!("chara base64 解码失败: {e}")))?;
    String::from_utf8(bytes).map_err(|_| AppError::other("chara 内容不是有效 UTF-8"))
}

/// 构造一个 chunk：[len][type][data][crc]
fn build_chunk(chunk_type: &[u8; 4], data: &[u8]) -> Vec<u8> {
    let mut crc_input = Vec::with_capacity(4 + data.len());
    crc_input.extend_from_slice(chunk_type);
    crc_input.extend_from_slice(data);
    let mut out = Vec::with_capacity(12 + data.len());
    out.extend_from_slice(&(data.len() as u32).to_be_bytes());
    out.extend_from_slice(chunk_type);
    out.extend_from_slice(data);
    out.extend_from_slice(&crc32fast::hash(&crc_input).to_be_bytes());
    out
}

/// 把 chara JSON 嵌入 PNG（插到 IEND 前）。原 PNG 已有的 chara chunk 会被跳过，避免重复。
pub fn embed_chara(png: &[u8], chara_json: &str) -> AppResult<Vec<u8>> {
    check_signature(png)?;
    let value = base64::engine::general_purpose::STANDARD.encode(chara_json.as_bytes());
    let mut text = Vec::with_capacity(CHARA_KEYWORD.len() + 1 + value.len());
    text.extend_from_slice(CHARA_KEYWORD);
    text.push(0);
    text.extend_from_slice(value.as_bytes());
    let chara_chunk = build_chunk(b"tEXt", &text);

    let mut out = Vec::with_capacity(png.len() + chara_chunk.len());
    out.extend_from_slice(&PNG_SIG);
    let mut pos = PNG_SIG.len();
    let mut inserted = false;
    while pos + 8 <= png.len() {
        let len = u32::from_be_bytes(png[pos..pos + 4].try_into().unwrap()) as usize;
        let chunk_type = &png[pos + 4..pos + 8];
        let data_start = pos + 8;
        let data_end = data_start + len;
        if data_end + 4 > png.len() {
            return Err(AppError::other("PNG chunk 数据越界"));
        }
        let is_chara = chunk_type == b"tEXt"
            && png[data_start..data_end]
                .iter()
                .position(|&b| b == 0)
                .map(|n| &png[data_start..data_start + n] == CHARA_KEYWORD)
                .unwrap_or(false);
        if is_chara {
            pos = data_end + 4;
            continue;
        }
        if chunk_type == b"IEND" && !inserted {
            out.extend_from_slice(&chara_chunk);
            inserted = true;
        }
        out.extend_from_slice(&png[pos..data_end + 4]);
        pos = data_end + 4;
    }
    if !inserted {
        return Err(AppError::other("PNG 缺少 IEND chunk"));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 手搓一个结构合法的最小 PNG（1x1，无 IDAT 也足以测 chunk 逻辑）
    pub fn fixture_png() -> Vec<u8> {
        let mut png = Vec::new();
        png.extend_from_slice(&PNG_SIG);
        // IHDR: 宽高 1x1, 8bit RGBA
        let mut ihdr = Vec::new();
        ihdr.extend_from_slice(&1u32.to_be_bytes());
        ihdr.extend_from_slice(&1u32.to_be_bytes());
        ihdr.extend_from_slice(&[8, 6, 0, 0, 0]);
        png.extend_from_slice(&build_chunk(b"IHDR", &ihdr));
        // 一段任意 IDAT（内容无关紧要）
        png.extend_from_slice(&build_chunk(b"IDAT", &[0x78, 0x9C, 0x63, 0x00]));
        png.extend_from_slice(&build_chunk(b"IEND", &[]));
        png
    }

    #[test]
    fn embed_extract_roundtrip() {
        let png = fixture_png();
        assert!(extract_chara(&png).unwrap().is_none());

        let json = r#"{"spec":"chara_card_v2","data":{"name":"测试"}}"#;
        let embedded = embed_chara(&png, json).unwrap();
        assert_eq!(extract_chara(&embedded).unwrap().unwrap(), json);

        // 再嵌一次不产生重复 chara
        let re_embedded = embed_chara(&embedded, json).unwrap();
        assert_eq!(extract_chara(&re_embedded).unwrap().unwrap(), json);
        let count = count_chara_chunks(&re_embedded);
        assert_eq!(count, 1);

        // 原有 chunk 透传：chara 插在 IEND 前，插入点之前的字节与末尾 IEND 都原样保留
        let iend_len = 12; // len(4) + type(4) + crc(4)
        assert_eq!(
            embedded[..png.len() - iend_len],
            png[..png.len() - iend_len]
        );
        assert_eq!(
            &embedded[embedded.len() - iend_len..],
            &png[png.len() - iend_len..]
        );
    }

    fn count_chara_chunks(png: &[u8]) -> usize {
        let mut pos = 8;
        let mut count = 0;
        while pos + 8 <= png.len() {
            let len = u32::from_be_bytes(png[pos..pos + 4].try_into().unwrap()) as usize;
            let data_start = pos + 8;
            let data_end = data_start + len;
            if &png[pos + 4..pos + 8] == b"tEXt"
                && png[data_start..data_end]
                    .iter()
                    .position(|&b| b == 0)
                    .map(|n| &png[data_start..data_start + n] == CHARA_KEYWORD)
                    .unwrap_or(false)
            {
                count += 1;
            }
            pos = data_end + 4;
        }
        count
    }

    #[test]
    fn tolerates_data_url_prefix() {
        let value = format!(
            "data:application/json;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(r#"{"name":"前缀卡"}"#)
        );
        assert_eq!(decode_chara_value(&value).unwrap(), r#"{"name":"前缀卡"}"#);
        assert_eq!(
            decode_chara_value(
                &base64::engine::general_purpose::STANDARD.encode(r#"{"name":"纯卡"}"#)
            )
            .unwrap(),
            r#"{"name":"纯卡"}"#
        );
    }

    #[test]
    fn rejects_non_png() {
        assert!(extract_chara(b"not a png at all").is_err());
        assert!(embed_chara(b"nope", "{}").is_err());
    }
}
