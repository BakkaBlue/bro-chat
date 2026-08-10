//! 角色卡文件读写与格式检测（.png / .json）

use std::path::Path;

use crate::avatar;
use crate::error::{AppError, AppResult};
use crate::models::{Character, Lorebook};

use super::png_chunks;
use super::spec::{self, CharaData};

fn extension(path: &Path) -> AppResult<String> {
    Ok(path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase())
}

/// 读取角色卡文件 → (CharaData, 头像原始字节)。PNG 卡的头像就是整个 PNG。
pub fn read_card(path: &Path) -> AppResult<(CharaData, Option<Vec<u8>>)> {
    match extension(path)?.as_str() {
        "png" => {
            let bytes = std::fs::read(path)?;
            let chara = png_chunks::extract_chara(&bytes)?.ok_or_else(|| {
                AppError::other("该 PNG 中没有 chara 数据，不是有效的角色卡")
            })?;
            let data = spec::parse_json(&chara)
                .map_err(|e| AppError::other(format!("卡片 JSON 解析失败: {e}")))?;
            Ok((data, Some(bytes)))
        }
        "json" => {
            let text = std::fs::read_to_string(path)?;
            let data = spec::parse_json(&text)
                .map_err(|e| AppError::other(format!("卡片 JSON 解析失败: {e}")))?;
            Ok((data, None))
        }
        other => Err(AppError::other(format!(
            "不支持的文件格式: {other}（仅支持 .png / .json）"
        ))),
    }
}

/// 写入角色卡文件。导出 PNG 需要角色的 PNG 头像（chara 嵌入 tEXt），
/// 无 PNG 头像时导出 JSON。有世界书时嵌入最新内容。
pub fn write_card(path: &Path, c: &Character, lorebook: Option<&Lorebook>) -> AppResult<()> {
    let mut data = CharaData::default();
    spec::apply_to_card(c, &mut data, lorebook);
    let json = spec::serialize_v2(&data);
    match extension(path)?.as_str() {
        "png" => {
            let avatar = avatar::decode(c.avatar.as_deref())?
                .filter(|b| b.starts_with(&[0x89, b'P', b'N', b'G']))
                .ok_or_else(|| {
                    AppError::other("该角色没有 PNG 头像，无法导出 PNG 卡；请导出为 JSON 格式")
                })?;
            std::fs::write(path, png_chunks::embed_chara(&avatar, &json)?)?;
        }
        "json" => {
            std::fs::write(path, json)?;
        }
        other => {
            return Err(AppError::other(format!(
                "不支持的导出格式: {other}（仅支持 .png / .json）"
            )))
        }
    }
    Ok(())
}
