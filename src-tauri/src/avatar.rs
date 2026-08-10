use base64::Engine as _;

use crate::error::{AppError, AppResult};

/// BLOB → data URL（嗅探魔数决定 MIME）
pub fn encode(bytes: &[u8]) -> String {
    let mime = if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        "image/png"
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        "image/jpeg"
    } else if bytes.starts_with(b"GIF8") {
        "image/gif"
    } else {
        "application/octet-stream"
    };
    format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    )
}

/// data URL / 纯 base64 → BLOB；None → None
pub fn decode(s: Option<&str>) -> AppResult<Option<Vec<u8>>> {
    match s {
        None => Ok(None),
        Some(raw) => {
            let b64 = raw
                .strip_prefix("data:")
                .and_then(|r| r.split_once(','))
                .map(|(_, b)| b)
                .unwrap_or(raw);
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(b64.trim())
                .map_err(|e| AppError::other(format!("头像 base64 解码失败: {e}")))?;
            Ok(Some(bytes))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encode_decode_roundtrip() {
        let png = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3];
        let url = encode(&png);
        assert!(url.starts_with("data:image/png;base64,"));
        let bytes = decode(Some(&url)).unwrap().unwrap();
        assert_eq!(bytes, png);

        // 纯 base64 也接受
        let raw = base64::engine::general_purpose::STANDARD.encode(png);
        let bytes = decode(Some(&raw)).unwrap().unwrap();
        assert_eq!(bytes, png);

        // 非 PNG 魔数
        let jpeg = [0xFF, 0xD8, 0xFF, 0xE0];
        assert!(encode(&jpeg).starts_with("data:image/jpeg;base64,"));

        // None 透传
        assert!(decode(None).unwrap().is_none());

        // 非法 base64 报错
        assert!(decode(Some("!!not-base64!!")).is_err());
    }
}
