#!/usr/bin/env python3
"""
Generate professional, pixel-perfect Splash Screen images for TimeFlow.
Produces:
1. assets/splash.png (Option A: Warm Beige #FBF5EF - seamless with App HomeScreen)
2. assets/splash_coral.png (Option B: Coral Red #FF6B6B - brand vibrant edition)
"""

import os
import numpy as np
from PIL import Image, ImageFilter, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
MASTER_PATH = os.path.join(ROOT, 'store_assets', 'app_icon_master_1254.png')
if not os.path.exists(MASTER_PATH):
    MASTER_PATH = os.path.join(ROOT, 'store_assets', 'app_icon_512x512.png')

master = Image.open(MASTER_PATH).convert('RGB')
mw, mh = master.size

# 1. 提取高精度白色矢量徽标
arr = np.array(master, dtype=np.float32)
bg_channel = np.minimum(arr[:, :, 1], arr[:, :, 2])
t_low = 75.0
t_high = 230.0

alpha = np.clip((bg_channel - t_low) / (t_high - t_low), 0.0, 1.0) * 255.0
alpha_u8 = alpha.astype(np.uint8)

emblem_raw = Image.new('RGBA', (mw, mh), (255, 255, 255, 0))
white = Image.new('RGBA', (mw, mh), (255, 255, 255, 255))
emblem_raw.paste(white, (0, 0), Image.fromarray(alpha_u8, 'L'))
bbox = emblem_raw.split()[-1].getbbox()
cropped_emblem = emblem_raw.crop(bbox)

# 字体加载
FONT_BOLD_ZH = 'C:/Windows/Fonts/msyhbd.ttc'
FONT_REG_ZH = 'C:/Windows/Fonts/msyh.ttc'
FONT_BOLD_EN = 'C:/Windows/Fonts/segoeuib.ttf'
FONT_REG_EN = 'C:/Windows/Fonts/segoeui.ttf'

if not os.path.exists(FONT_BOLD_ZH):
    FONT_BOLD_ZH = 'C:/Windows/Fonts/arialbd.ttf'
if not os.path.exists(FONT_REG_ZH):
    FONT_REG_ZH = 'C:/Windows/Fonts/arial.ttf'
if not os.path.exists(FONT_BOLD_EN):
    FONT_BOLD_EN = FONT_BOLD_ZH
if not os.path.exists(FONT_REG_EN):
    FONT_REG_EN = FONT_REG_ZH

font_title = ImageFont.truetype(FONT_BOLD_EN, 56)
font_sub_zh = ImageFont.truetype(FONT_REG_ZH, 24)
font_sub_en = ImageFont.truetype(FONT_REG_EN, 24)
font_sub_bi_zh = ImageFont.truetype(FONT_REG_ZH, 21)
font_sub_bi_en = ImageFont.truetype(FONT_REG_EN, 17)

CANVAS_W = 1284
CANVAS_H = 2778

def create_rounded_squircle(size, radius, color):
    mask = Image.new('L', (size * 4, size * 4), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([(0, 0), (size * 4, size * 4)], radius=radius * 4, fill=255)
    mask = mask.resize((size, size), Image.Resampling.LANCZOS)
    card = Image.new('RGBA', (size, size), color)
    card.putalpha(mask)
    return card

# ==================== 方案 A：暖米白底 (#FBF5EF) 多语言支持 ====================
def generate_splash_warm_beige(lang='zh'):
    canvas = Image.new('RGBA', (CANVAS_W, CANVAS_H), (251, 245, 239, 255)) # #FBF5EF
    
    card_size = 280
    card = create_rounded_squircle(card_size, 68, (255, 107, 107, 255)) # #FF6B6B
    
    emb_w = int(card_size * 0.62)
    aspect = cropped_emblem.height / cropped_emblem.width
    emb_h = int(emb_w * aspect)
    scaled_emb = cropped_emblem.resize((emb_w, emb_h), Image.Resampling.LANCZOS)
    
    emb_x = (card_size - emb_w) // 2
    emb_y = (card_size - emb_h) // 2
    card.alpha_composite(scaled_emb, (emb_x, emb_y))
    
    # 柔和阴影
    shadow_base = Image.new('RGBA', (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    shadow_card = Image.new('RGBA', (card_size, card_size), (43, 35, 30, 45))
    shadow_card_mask = card.split()[-1]
    
    card_x = (CANVAS_W - card_size) // 2
    card_y = int(CANVAS_H * 0.40) - 100
    
    shadow_base.paste(shadow_card, (card_x, card_y + 16), shadow_card_mask)
    blurred_shadow = shadow_base.filter(ImageFilter.GaussianBlur(radius=22))
    
    canvas.alpha_composite(blurred_shadow)
    canvas.alpha_composite(card, (card_x, card_y))
    
    # 标题 "TimeFlow"
    draw = ImageDraw.Draw(canvas)
    title_text = "TimeFlow"
    tb = draw.textbbox((0, 0), title_text, font=font_title)
    tw = tb[2] - tb[0]
    title_x = (CANVAS_W - tw) // 2
    title_y = card_y + card_size + 42
    draw.text((title_x, title_y), title_text, fill=(43, 35, 30, 255), font=font_title) # #2B231E
    
    # 根据语言排版副标题
    if lang == 'zh':
        sub_text = "记 录 专 注 与 足 迹"
        sb = draw.textbbox((0, 0), sub_text, font=font_sub_zh)
        sw = sb[2] - sb[0]
        sub_x = (CANVAS_W - sw) // 2
        sub_y = title_y + 74
        draw.text((sub_x, sub_y), sub_text, fill=(122, 111, 102, 230), font=font_sub_zh) # #7A6F66
    elif lang == 'en':
        sub_text = "Focus & Footprints"
        sb = draw.textbbox((0, 0), sub_text, font=font_sub_en)
        sw = sb[2] - sb[0]
        sub_x = (CANVAS_W - sw) // 2
        sub_y = title_y + 74
        draw.text((sub_x, sub_y), sub_text, fill=(122, 111, 102, 230), font=font_sub_en)
    elif lang == 'bilingual':
        # 双语版上下双行
        sub_zh = "记 录 专 注 与 足 迹"
        sb_zh = draw.textbbox((0, 0), sub_zh, font=font_sub_bi_zh)
        sw_zh = sb_zh[2] - sb_zh[0]
        sub_x_zh = (CANVAS_W - sw_zh) // 2
        sub_y_zh = title_y + 68
        draw.text((sub_x_zh, sub_y_zh), sub_zh, fill=(122, 111, 102, 235), font=font_sub_bi_zh)
        
        sub_en = "Focus & Footprints"
        sb_en = draw.textbbox((0, 0), sub_en, font=font_sub_bi_en)
        sw_en = sb_en[2] - sb_en[0]
        sub_x_en = (CANVAS_W - sw_en) // 2
        sub_y_en = sub_y_zh + 36
        draw.text((sub_x_en, sub_y_en), sub_en, fill=(145, 134, 125, 220), font=font_sub_bi_en)
    
    return canvas.convert('RGB')

# 独立生成透明背景的中心内容块 (用于 Android Native layer-list)
def generate_splash_content_transparent(lang='zh'):
    unit_w = 600
    unit_h = 700
    unit = Image.new('RGBA', (unit_w, unit_h), (0, 0, 0, 0))
    
    card_size = 280
    card = create_rounded_squircle(card_size, 68, (255, 107, 107, 255))
    
    emb_w = int(card_size * 0.62)
    aspect = cropped_emblem.height / cropped_emblem.width
    emb_h = int(emb_w * aspect)
    scaled_emb = cropped_emblem.resize((emb_w, emb_h), Image.Resampling.LANCZOS)
    
    emb_x = (card_size - emb_w) // 2
    emb_y = (card_size - emb_h) // 2
    card.alpha_composite(scaled_emb, (emb_x, emb_y))
    
    card_x = (unit_w - card_size) // 2
    card_y = 60
    
    # 阴影
    shadow_base = Image.new('RGBA', (unit_w, unit_h), (0, 0, 0, 0))
    shadow_card = Image.new('RGBA', (card_size, card_size), (43, 35, 30, 45))
    shadow_card_mask = card.split()[-1]
    shadow_base.paste(shadow_card, (card_x, card_y + 16), shadow_card_mask)
    blurred_shadow = shadow_base.filter(ImageFilter.GaussianBlur(radius=22))
    
    unit.alpha_composite(blurred_shadow)
    unit.alpha_composite(card, (card_x, card_y))
    
    draw = ImageDraw.Draw(unit)
    title_text = "TimeFlow"
    tb = draw.textbbox((0, 0), title_text, font=font_title)
    tw = tb[2] - tb[0]
    title_x = (unit_w - tw) // 2
    title_y = card_y + card_size + 42
    draw.text((title_x, title_y), title_text, fill=(43, 35, 30, 255), font=font_title)
    
    if lang == 'zh':
        sub_text = "记 录 专 注 与 足 迹"
        sb = draw.textbbox((0, 0), sub_text, font=font_sub_zh)
        sw = sb[2] - sb[0]
        sub_x = (unit_w - sw) // 2
        sub_y = title_y + 74
        draw.text((sub_x, sub_y), sub_text, fill=(122, 111, 102, 230), font=font_sub_zh)
    elif lang == 'en':
        sub_text = "Focus & Footprints"
        sb = draw.textbbox((0, 0), sub_text, font=font_sub_en)
        sw = sb[2] - sb[0]
        sub_x = (unit_w - sw) // 2
        sub_y = title_y + 74
        draw.text((sub_x, sub_y), sub_text, fill=(122, 111, 102, 230), font=font_sub_en)
    elif lang == 'bilingual':
        sub_zh = "记 录 专 注 与 足 迹"
        sb_zh = draw.textbbox((0, 0), sub_zh, font=font_sub_bi_zh)
        sw_zh = sb_zh[2] - sb_zh[0]
        sub_x_zh = (unit_w - sw_zh) // 2
        sub_y_zh = title_y + 68
        draw.text((sub_x_zh, sub_y_zh), sub_zh, fill=(122, 111, 102, 235), font=font_sub_bi_zh)
        
        sub_en = "Focus & Footprints"
        sb_en = draw.textbbox((0, 0), sub_en, font=font_sub_bi_en)
        sw_en = sb_en[2] - sb_en[0]
        sub_x_en = (unit_w - sw_en) // 2
        sub_y_en = sub_y_zh + 36
        draw.text((sub_x_en, sub_y_en), sub_en, fill=(145, 134, 125, 220), font=font_sub_bi_en)
    
    # 紧凑裁剪 (保留边缘透明度)
    bbox = unit.split()[-1].getbbox()
    cropped = unit.crop((bbox[0] - 10, bbox[1] - 10, bbox[2] + 10, bbox[3] + 10))
    return cropped

# 生成 Android 12+ 专用的 Splash Icon (512x512 并在 160dp 安全圈内)
def generate_android12_splash_icon():
    size = 512
    icon = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    card_size = int(size * 0.65) # 332px，安全位于 400px 直径的圆内
    card = create_rounded_squircle(card_size, int(card_size * (68 / 280)), (255, 107, 107, 255))
    
    emb_w = int(card_size * 0.62)
    aspect = cropped_emblem.height / cropped_emblem.width
    emb_h = int(emb_w * aspect)
    scaled_emb = cropped_emblem.resize((emb_w, emb_h), Image.Resampling.LANCZOS)
    
    emb_x = (card_size - emb_w) // 2
    emb_y = (card_size - emb_h) // 2
    card.alpha_composite(scaled_emb, (emb_x, emb_y))
    
    cx = (size - card_size) // 2
    cy = (size - card_size) // 2
    icon.alpha_composite(card, (cx, cy))
    return icon

# ==================== 方案 B：品牌珊瑚红底 (#FF6B6B) ====================
def generate_splash_coral_red():
    canvas = Image.new('RGBA', (CANVAS_W, CANVAS_H), (255, 107, 107, 255)) # #FF6B6B
    
    # 纯白大徽标 (宽 320)
    emb_w = 320
    aspect = cropped_emblem.height / cropped_emblem.width
    emb_h = int(emb_w * aspect)
    scaled_emb = cropped_emblem.resize((emb_w, emb_h), Image.Resampling.LANCZOS)
    
    emb_x = (CANVAS_W - emb_w) // 2
    emb_y = int(CANVAS_H * 0.40) - 60
    
    # 纯白微投影
    shadow_base = Image.new('RGBA', (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    s_alpha = scaled_emb.split()[-1].point(lambda p: int(p * 0.15))
    s_color = Image.new('RGBA', (emb_w, emb_h), (0, 0, 0, 255))
    shadow_base.paste(s_color, (emb_x, emb_y + 10), s_alpha)
    blurred_shadow = shadow_base.filter(ImageFilter.GaussianBlur(radius=16))
    
    canvas.alpha_composite(blurred_shadow)
    canvas.alpha_composite(scaled_emb, (emb_x, emb_y))
    
    # 纯白标题 "TimeFlow"
    draw = ImageDraw.Draw(canvas)
    title_text = "TimeFlow"
    tb = draw.textbbox((0, 0), title_text, font=font_title)
    tw = tb[2] - tb[0]
    title_x = (CANVAS_W - tw) // 2
    title_y = emb_y + emb_h + 52
    draw.text((title_x, title_y), title_text, fill=(255, 255, 255, 255), font=font_title)
    
    # 白色副标题
    sub_text = "记 录 专 注 与 足 迹"
    sb = draw.textbbox((0, 0), sub_text, font=font_sub_zh)
    sw = sb[2] - sb[0]
    sub_x = (CANVAS_W - sw) // 2
    sub_y = title_y + 74
    draw.text((sub_x, sub_y), sub_text, fill=(255, 255, 255, 210), font=font_sub_zh)
    
    return canvas.convert('RGB')

# ==================== 执行全套资产生成与保存 ====================
print("1. 生成方案 A 全尺寸图片 (1284x2778)...")

# 中文版 (默认)
img_zh = generate_splash_warm_beige('zh')
path_zh = os.path.join(ROOT, 'assets', 'splash.png')
path_zh_alias = os.path.join(ROOT, 'assets', 'splash_zh.png')
img_zh.save(path_zh, 'PNG', optimize=True)
img_zh.save(path_zh_alias, 'PNG', optimize=True)
print(f"✔ Saved: {path_zh} (中文默认版)")

# 英文版
img_en = generate_splash_warm_beige('en')
path_en = os.path.join(ROOT, 'assets', 'splash_en.png')
img_en.save(path_en, 'PNG', optimize=True)
print(f"✔ Saved: {path_en} (英文版)")

# 双语版
img_bi = generate_splash_warm_beige('bilingual')
path_bi = os.path.join(ROOT, 'assets', 'splash_bilingual.png')
img_bi.save(path_bi, 'PNG', optimize=True)
print(f"✔ Saved: {path_bi} (双语版)")

# 方案 B (珊瑚红备选)
print("\n2. 生成方案 B (珊瑚红纯色版)...")
img_b = generate_splash_coral_red()
path_b = os.path.join(ROOT, 'assets', 'splash_coral.png')
img_b.save(path_b, 'PNG', optimize=True)
print(f"✔ Saved: {path_b} (1284x2778)")

# 生成 Android 原生资源
print("\n3. 生成 Android 原生多语言多密度资源...")
res_dir = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
drawable_dir = os.path.join(res_dir, 'drawable')
os.makedirs(drawable_dir, exist_ok=True)

# 3.1 Android 12+ Splash Icon (系统通用语言)
a12_icon = generate_android12_splash_icon()
a12_path = os.path.join(drawable_dir, 'splash_icon.png')
a12_icon.save(a12_path, 'PNG', optimize=True)
print(f"✔ Saved Android 12+ icon: {a12_path} (512x512)")

# 3.2 生成各语言的透明中心内容块
content_zh = generate_splash_content_transparent('zh')
content_en = generate_splash_content_transparent('en')

density_scales = {
    'mdpi': 1.0 / 3.0,
    'hdpi': 1.5 / 3.0,
    'xhdpi': 2.0 / 3.0,
    'xxhdpi': 1.0,        # 设计基准
    'xxxhdpi': 4.0 / 3.0,
}

for density, scale in density_scales.items():
    # A. 中文目录: drawable-zh-*dpi
    dir_zh = os.path.join(res_dir, f'drawable-zh-{density}')
    os.makedirs(dir_zh, exist_ok=True)
    w_zh, h_zh = content_zh.size
    scaled_zh = content_zh.resize((max(1, int(w_zh * scale)), max(1, int(h_zh * scale))), Image.Resampling.LANCZOS)
    scaled_zh.save(os.path.join(dir_zh, 'splash_screen_content.png'), 'PNG', optimize=True)
    
    # B. 英文目录: drawable-en-*dpi
    dir_en = os.path.join(res_dir, f'drawable-en-{density}')
    os.makedirs(dir_en, exist_ok=True)
    w_en, h_en = content_en.size
    scaled_en = content_en.resize((max(1, int(w_en * scale)), max(1, int(h_en * scale))), Image.Resampling.LANCZOS)
    scaled_en.save(os.path.join(dir_en, 'splash_screen_content.png'), 'PNG', optimize=True)
    
    # C. 默认回退目录 (非 zh 语言设备通用回退，使用英文版): drawable-*dpi
    dir_def = os.path.join(res_dir, f'drawable-{density}')
    os.makedirs(dir_def, exist_ok=True)
    scaled_en.save(os.path.join(dir_def, 'splash_screen_content.png'), 'PNG', optimize=True)
    
    print(f"✔ 分发密度 {density}: zh -> {dir_zh}, en -> {dir_en}, default -> {dir_def}")

print("\n🎉 中英文全套启动页资产已全部构建完成！")
