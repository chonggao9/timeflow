#!/usr/bin/env python3
"""
Generate complete app icon assets for TimeFlow from high-res master icon.
Updates:
1. assets/icon.png (1024x1024)
2. assets/adaptive-icon.png (1024x1024 transparent with centered emblem & shadow)
3. store_assets/app_icon_512x512.png (512x512 PNG)
4. store_assets/app_icon_512x512.jpg (512x512 JPEG)
5. store_assets/timeflow_icon_512.png (512x512 PNG)
6. android/app/src/main/res/mipmap-* (all densities: ic_launcher, ic_launcher_round, ic_launcher_foreground)
7. android/app/src/main/res/drawable/ic_launcher_background.xml
8. android/app/src/main/res/values/colors.xml
"""

import os
import shutil
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
MASTER_PATH = os.path.join(ROOT, 'store_assets', 'app_icon_master_1254.png')
if not os.path.exists(MASTER_PATH):
    MASTER_PATH = os.path.join(ROOT, 'store_assets', 'app_icon_512x512.png')

print(f"Loading master icon from: {MASTER_PATH}")
master = Image.open(MASTER_PATH).convert('RGB')
mw, mh = master.size

# --- 1. Extract White Emblem with Smooth Alpha ---
arr = np.array(master, dtype=np.float32)
bg_channel = np.minimum(arr[:, :, 1], arr[:, :, 2])
t_low = 75.0
t_high = 230.0

alpha = np.clip((bg_channel - t_low) / (t_high - t_low), 0.0, 1.0) * 255.0
alpha_u8 = alpha.astype(np.uint8)

emblem_raw = Image.new('RGBA', (mw, mh), (255, 255, 255, 0))
white = Image.new('RGBA', (mw, mh), (255, 255, 255, 255))
emblem_raw.paste(white, (0, 0), Image.fromarray(alpha_u8, 'L'))

# Tight crop of emblem
bbox = emblem_raw.split()[-1].getbbox()
print(f"Emblem tight bbox: {bbox}")
cropped_emblem = emblem_raw.crop(bbox)

# --- Helper: Generate Adaptive Foreground Image ---
def generate_adaptive_foreground(canvas_size):
    """
    Creates centered white emblem with subtle drop shadow on transparent canvas.
    Safe zone for Android adaptive icon: inner 66% circle.
    Target emblem width: ~50% of canvas_size.
    """
    target_w = int(canvas_size * 0.50)
    aspect = cropped_emblem.height / cropped_emblem.width
    target_h = int(target_w * aspect)

    scaled_emblem = cropped_emblem.resize((target_w, target_h), Image.Resampling.LANCZOS)

    # Position centered
    pos_x = (canvas_size - target_w) // 2
    pos_y = (canvas_size - target_h) // 2

    # Drop shadow
    shadow_base = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    shadow_alpha = scaled_emblem.split()[-1].point(lambda p: int(p * 0.22))
    shadow_layer = Image.new('RGBA', (target_w, target_h), (0, 0, 0, 255))
    shadow_offset = max(1, int(canvas_size * 0.01))
    shadow_blur = max(1, int(canvas_size * 0.008))
    shadow_base.paste(shadow_layer, (pos_x, pos_y + shadow_offset), shadow_alpha)
    blurred_shadow = shadow_base.filter(ImageFilter.GaussianBlur(radius=shadow_blur))

    # Composite
    fg = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    fg.alpha_composite(blurred_shadow)
    fg.alpha_composite(scaled_emblem, (pos_x, pos_y))
    return fg

# --- Helper: Generate Round Icon ---
def generate_round_icon(size):
    """
    Generate circular icon with master gradient and slightly padded emblem.
    """
    # Create circular mask
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, size, size), fill=255)

    # Resize master to size
    scaled_master = master.resize((size, size), Image.Resampling.LANCZOS)
    
    round_img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    round_img.paste(scaled_master, (0, 0), mask)
    return round_img

# --- Helper: Generate Square Icon ---
def generate_square_icon(size):
    return master.resize((size, size), Image.Resampling.LANCZOS)

# --- 2. Update assets/ ---
print("\nUpdating assets/...")
assets_icon_path = os.path.join(ROOT, 'assets', 'icon.png')
generate_square_icon(1024).save(assets_icon_path, 'PNG', optimize=True)
print(f"✔ Saved: {assets_icon_path} (1024x1024)")

assets_adaptive_path = os.path.join(ROOT, 'assets', 'adaptive-icon.png')
generate_adaptive_foreground(1024).save(assets_adaptive_path, 'PNG', optimize=True)
print(f"✔ Saved: {assets_adaptive_path} (1024x1024, transparent foreground)")

# --- 3. Update store_assets/ ---
print("\nUpdating store_assets/...")
store_png = os.path.join(ROOT, 'store_assets', 'app_icon_512x512.png')
generate_square_icon(512).save(store_png, 'PNG', optimize=True)
print(f"✔ Saved: {store_png} (512x512)")

store_jpg = os.path.join(ROOT, 'store_assets', 'app_icon_512x512.jpg')
generate_square_icon(512).save(store_jpg, 'JPEG', quality=95)
print(f"✔ Saved: {store_jpg} (512x512)")

store_tf = os.path.join(ROOT, 'store_assets', 'timeflow_icon_512.png')
generate_square_icon(512).save(store_tf, 'PNG', optimize=True)
print(f"✔ Saved: {store_tf} (512x512)")

# --- 4. Update Android Mipmap Folders ---
print("\nUpdating Android native mipmaps...")
densities = {
    'mipmap-mdpi': {'launcher': 48, 'foreground': 108},
    'mipmap-hdpi': {'launcher': 72, 'foreground': 162},
    'mipmap-xhdpi': {'launcher': 96, 'foreground': 216},
    'mipmap-xxhdpi': {'launcher': 144, 'foreground': 324},
    'mipmap-xxxhdpi': {'launcher': 192, 'foreground': 432},
}

res_dir = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')

for folder, dims in densities.items():
    dir_path = os.path.join(res_dir, folder)
    os.makedirs(dir_path, exist_ok=True)
    
    l_size = dims['launcher']
    fg_size = dims['foreground']

    # ic_launcher.webp
    l_path = os.path.join(dir_path, 'ic_launcher.webp')
    generate_square_icon(l_size).save(l_path, 'WEBP', lossless=True)

    # ic_launcher_round.webp
    r_path = os.path.join(dir_path, 'ic_launcher_round.webp')
    generate_round_icon(l_size).save(r_path, 'WEBP', lossless=True)

    # ic_launcher_foreground.webp
    fg_path = os.path.join(dir_path, 'ic_launcher_foreground.webp')
    generate_adaptive_foreground(fg_size).save(fg_path, 'WEBP', lossless=True)

    print(f"✔ Updated {folder}: launcher={l_size}x{l_size}, foreground={fg_size}x{fg_size}")

print("\n🎉 All icon assets successfully regenerated!")
