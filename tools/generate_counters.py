#!/usr/bin/env python3
"""
Pokemon TCG Damage Counter PNG Generator

Generates coin-shaped damage counters with transparent backgrounds:
- Burn (red with flame icon)
- Poison (green with skull icon)
- 10 Damage (yellow with "10" text)
- 50 Damage (orange with "50" text)
- 100 Damage (red with "100" text)

Uses Lucide icons for burn/poison counters.
"""

from PIL import Image, ImageDraw, ImageFont
import cairosvg
import io
import os
import urllib.request
from pathlib import Path


# Counter specifications
COUNTER_SIZE = 128  # pixels
BORDER_WIDTH = 4
INNER_CIRCLE_RATIO = 0.67  # Inner circle is 2/3 of outer radius

# Colors (solid, no gradients)
COLORS = {
    "burn": "#E53935",
    "poison": "#4CAF50",
    "damage_10": "#FFD54F",
    "damage_50": "#FF9800",
    "damage_100": "#F44336",
}

# Inner circle colors (slightly darker for depth)
COLORS_INNER = {
    "burn": "#C62828",
    "poison": "#388E3C",
    "damage_10": "#FFC107",
    "damage_50": "#F57C00",
    "damage_100": "#C62828",
}

# Lucide icon URLs
LUCIDE_ICONS = {
    "flame": "https://unpkg.com/lucide-static@latest/icons/flame.svg",
    "flask-round": "https://unpkg.com/lucide-static@latest/icons/flask-round.svg",
}


def hex_to_rgb(hex_color: str) -> tuple:
    """Convert hex color to RGB tuple."""
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i : i + 2], 16) for i in (0, 2, 4))


def fetch_lucide_icon(icon_name: str) -> str:
    """Fetch a Lucide icon SVG from the CDN."""
    url = LUCIDE_ICONS[icon_name]
    with urllib.request.urlopen(url) as response:
        return response.read().decode("utf-8")


def svg_to_png(svg_content: str, size: int, color: str = "white") -> Image.Image:
    """Convert SVG content to a PIL Image with specified color."""
    # Modify SVG to set stroke color
    svg_content = svg_content.replace('stroke="currentColor"', f'stroke="{color}"')
    svg_content = svg_content.replace('stroke-width="2"', 'stroke-width="3"')

    # Set explicit size in the SVG
    svg_content = svg_content.replace('width="24"', f'width="{size}"')
    svg_content = svg_content.replace('height="24"', f'height="{size}"')

    # Convert SVG to PNG bytes
    png_bytes = cairosvg.svg2png(bytestring=svg_content.encode("utf-8"))

    # Load as PIL Image
    return Image.open(io.BytesIO(png_bytes)).convert("RGBA")


def create_coin_base(size: int, outer_color: str, inner_color: str) -> Image.Image:
    """Create a coin-shaped base with solid colors."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    center = size // 2
    outer_radius = (size // 2) - 2
    inner_radius = int(outer_radius * INNER_CIRCLE_RATIO)

    # Draw outer circle border (black)
    draw.ellipse(
        [
            center - outer_radius,
            center - outer_radius,
            center + outer_radius,
            center + outer_radius,
        ],
        fill="black",
    )

    # Draw outer circle fill (slightly smaller for border)
    fill_radius = outer_radius - BORDER_WIDTH
    outer_rgb = hex_to_rgb(outer_color)
    draw.ellipse(
        [
            center - fill_radius,
            center - fill_radius,
            center + fill_radius,
            center + fill_radius,
        ],
        fill=outer_rgb,
    )

    # Draw inner circle border (black)
    draw.ellipse(
        [
            center - inner_radius,
            center - inner_radius,
            center + inner_radius,
            center + inner_radius,
        ],
        fill="black",
    )

    # Draw inner circle fill
    inner_fill_radius = inner_radius - BORDER_WIDTH // 2
    inner_rgb = hex_to_rgb(inner_color)
    draw.ellipse(
        [
            center - inner_fill_radius,
            center - inner_fill_radius,
            center + inner_fill_radius,
            center + inner_fill_radius,
        ],
        fill=inner_rgb,
    )

    return img


def draw_text_with_outline(
    draw: ImageDraw.Draw,
    text: str,
    center: tuple,
    font: ImageFont.FreeTypeFont,
    fill_color: str,
    outline_color: str = "black",
    outline_width: int = 3,
):
    """Draw text with an outline/stroke effect."""
    x, y = center

    # Get text bounding box for centering
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]

    # Adjust position to center text
    text_x = x - text_width // 2
    text_y = y - text_height // 2 - bbox[1]  # Account for font baseline offset

    # Draw outline by drawing text multiple times with offset
    for dx in range(-outline_width, outline_width + 1):
        for dy in range(-outline_width, outline_width + 1):
            if dx != 0 or dy != 0:
                draw.text((text_x + dx, text_y + dy), text, font=font, fill=outline_color)

    # Draw main text
    draw.text((text_x, text_y), text, font=font, fill=fill_color)


def get_font(size: int) -> ImageFont.FreeTypeFont:
    """Get a bold font for damage numbers."""
    # Try common system fonts
    font_paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
        "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "C:/Windows/Fonts/arialbd.ttf",
    ]

    for font_path in font_paths:
        if os.path.exists(font_path):
            try:
                return ImageFont.truetype(font_path, size)
            except Exception:
                continue

    # Fallback to default font
    return ImageFont.load_default()


def add_icon_with_outline(base_img: Image.Image, icon_img: Image.Image, outline_width: int = 3) -> Image.Image:
    """Add an icon to the center of the base image with a black outline."""
    result = base_img.copy()
    center = COUNTER_SIZE // 2

    # Calculate position to center the icon
    icon_x = center - icon_img.width // 2
    icon_y = center - icon_img.height // 2

    # Create outline by pasting black versions offset in all directions
    # First, create a black version of the icon (using alpha as mask)
    black_icon = Image.new("RGBA", icon_img.size, (0, 0, 0, 0))
    for px in range(icon_img.width):
        for py in range(icon_img.height):
            r, g, b, a = icon_img.getpixel((px, py))
            if a > 0:
                black_icon.putpixel((px, py), (0, 0, 0, a))

    # Paste black outline in all directions
    for dx in range(-outline_width, outline_width + 1):
        for dy in range(-outline_width, outline_width + 1):
            if dx != 0 or dy != 0:
                result.paste(black_icon, (icon_x + dx, icon_y + dy), black_icon)

    # Paste the actual icon on top
    result.paste(icon_img, (icon_x, icon_y), icon_img)

    return result


def create_damage_counter(value: int, color_key: str) -> Image.Image:
    """Create a damage counter with the specified value."""
    img = create_coin_base(COUNTER_SIZE, COLORS[color_key], COLORS_INNER[color_key])
    draw = ImageDraw.Draw(img)

    center = COUNTER_SIZE // 2

    # Determine font size based on number of digits
    if value >= 100:
        font_size = 40
    else:
        font_size = 50

    font = get_font(font_size)

    draw_text_with_outline(draw, str(value), (center, center), font, "white", "black", 3)

    return img


def create_icon_counter(color_key: str, icon_name: str) -> Image.Image:
    """Create a status counter with a Lucide icon."""
    img = create_coin_base(COUNTER_SIZE, COLORS[color_key], COLORS_INNER[color_key])

    # Calculate icon size to fit in inner circle
    inner_radius = int((COUNTER_SIZE // 2 - 2) * INNER_CIRCLE_RATIO)
    icon_size = int(inner_radius * 1.4)  # Icon fills most of inner circle

    # Fetch and render the icon
    svg_content = fetch_lucide_icon(icon_name)
    icon_img = svg_to_png(svg_content, icon_size, "white")

    # Add icon with outline to the base
    img = add_icon_with_outline(img, icon_img, outline_width=3)

    return img


def main():
    """Generate all counter images."""
    # Determine output directory
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    output_dir = project_root / "src" / "plugins" / "pokemon" / "counters"

    # Create output directory if it doesn't exist
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Generating counters in {output_dir}...")

    # Generate damage counters
    print("  Creating damage counters...")
    damage_counters = [
        ("damage-10.png", create_damage_counter(10, "damage_10")),
        ("damage-50.png", create_damage_counter(50, "damage_50")),
        ("damage-100.png", create_damage_counter(100, "damage_100")),
    ]

    for filename, img in damage_counters:
        filepath = output_dir / filename
        img.save(filepath, "PNG")
        print(f"    Created: {filename}")

    # Generate status counters with Lucide icons
    print("  Creating status counters (fetching Lucide icons)...")

    burn_img = create_icon_counter("burn", "flame")
    burn_path = output_dir / "burn.png"
    burn_img.save(burn_path, "PNG")
    print(f"    Created: burn.png")

    poison_img = create_icon_counter("poison", "flask-round")
    poison_path = output_dir / "poison.png"
    poison_img.save(poison_path, "PNG")
    print(f"    Created: poison.png")

    print("\nDone! All counters generated successfully.")


if __name__ == "__main__":
    main()
