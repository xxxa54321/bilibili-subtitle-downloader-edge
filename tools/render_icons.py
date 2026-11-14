from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "assets"
MASTER_SIZE = 2048


def mix(start, end, amount):
    return tuple(round(a + (b - a) * amount) for a, b in zip(start, end))


def rounded_mask(size, box, radius, scale=4):
    mask = Image.new("L", (size * scale, size * scale), 0)
    draw = ImageDraw.Draw(mask)
    scaled_box = tuple(value * scale for value in box)
    draw.rounded_rectangle(scaled_box, radius=radius * scale, fill=255)
    return mask.resize((size, size), Image.Resampling.LANCZOS)


def build_master():
    canvas = Image.new("RGBA", (MASTER_SIZE, MASTER_SIZE), (0, 0, 0, 0))
    background = Image.new("RGBA", (MASTER_SIZE, MASTER_SIZE))
    draw = ImageDraw.Draw(background)

    top = (17, 36, 52, 255)
    bottom = (24, 132, 151, 255)
    for y in range(MASTER_SIZE):
        amount = y / (MASTER_SIZE - 1)
        color = mix(top[:3], bottom[:3], amount)
        draw.line((0, y, MASTER_SIZE, y), fill=(*color, 255))

    glow = Image.new("RGBA", background.size, (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse((980, -420, 2450, 1050), fill=(95, 221, 201, 95))
    glow_draw.ellipse((-520, 1120, 1050, 2650), fill=(36, 112, 157, 70))
    glow = glow.filter(ImageFilter.GaussianBlur(220))
    background = Image.alpha_composite(background, glow)

    outer_mask = rounded_mask(MASTER_SIZE, (64, 64, 1984, 1984), 390)
    canvas.alpha_composite(Image.composite(background, Image.new("RGBA", background.size), outer_mask))

    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle(
        (64, 64, 1984, 1984),
        radius=390,
        outline=(255, 255, 255, 38),
        width=18,
    )

    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle(
        (430, 400, 1618, 1610),
        radius=210,
        fill=(0, 20, 34, 105),
    )
    shadow_draw.ellipse((1270, 1240, 1780, 1750), fill=(8, 23, 34, 120))
    shadow = shadow.filter(ImageFilter.GaussianBlur(54))
    canvas = Image.alpha_composite(canvas, shadow)

    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle(
        (400, 330, 1600, 1530),
        radius=220,
        fill=(248, 252, 250, 255),
    )
    draw.rounded_rectangle(
        (790, 258, 1210, 430),
        radius=86,
        fill=(230, 244, 239, 255),
    )
    draw.rounded_rectangle(
        (865, 220, 1135, 335),
        radius=57,
        fill=(255, 184, 77, 255),
    )

    line_color = (31, 104, 121, 255)
    draw.rounded_rectangle((585, 560, 1430, 655), radius=47, fill=line_color)
    draw.rounded_rectangle((585, 755, 1340, 850), radius=47, fill=line_color)
    draw.rounded_rectangle((585, 950, 1450, 1045), radius=47, fill=line_color)
    draw.rounded_rectangle((585, 1145, 1175, 1240), radius=47, fill=(109, 160, 171, 255))

    badge_shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    badge_draw = ImageDraw.Draw(badge_shadow)
    badge_draw.ellipse((1270, 1265, 1855, 1850), fill=(0, 17, 27, 115))
    badge_shadow = badge_shadow.filter(ImageFilter.GaussianBlur(38))
    canvas = Image.alpha_composite(canvas, badge_shadow)

    draw = ImageDraw.Draw(canvas)
    draw.ellipse((1290, 1230, 1840, 1780), fill=(255, 184, 77, 255))
    draw.ellipse((1330, 1270, 1800, 1740), outline=(255, 218, 148, 190), width=18)

    arrow_white = (23, 45, 61, 255)
    draw.rounded_rectangle(
        (1524, 1335, 1606, 1580),
        radius=41,
        fill=arrow_white,
    )
    draw.polygon(
        [(1458, 1524), (1565, 1637), (1672, 1524)],
        fill=arrow_white,
    )
    draw.rounded_rectangle(
        (1412, 1668, 1718, 1735),
        radius=33,
        fill=arrow_white,
    )
    return canvas


def build_small_master():
    size = 1024
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    background = Image.new("RGBA", (size, size))
    draw = ImageDraw.Draw(background)
    top = (17, 36, 52, 255)
    bottom = (24, 132, 151, 255)
    for y in range(size):
        color = mix(top[:3], bottom[:3], y / (size - 1))
        draw.line((0, y, size, y), fill=(*color, 255))
    mask = rounded_mask(size, (16, 16, 1008, 1008), 190)
    canvas.alpha_composite(Image.composite(background, Image.new("RGBA", background.size), mask))

    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((170, 140, 820, 820), radius=110, fill=(248, 252, 250, 255))
    line_color = (31, 104, 121, 255)
    draw.rounded_rectangle((270, 300, 700, 385), radius=43, fill=line_color)
    draw.rounded_rectangle((270, 455, 650, 540), radius=43, fill=line_color)
    draw.rounded_rectangle((270, 610, 715, 695), radius=43, fill=line_color)
    draw.ellipse((620, 610, 1005, 995), fill=(255, 184, 77, 255))
    arrow = (23, 45, 61, 255)
    draw.rounded_rectangle((786, 700, 845, 865), radius=27, fill=arrow)
    draw.polygon([(744, 831), (815, 905), (886, 831)], fill=arrow)
    draw.rounded_rectangle((716, 925, 915, 972), radius=22, fill=arrow)
    return canvas


def save_resized(master, size, path):
    resized = master.resize((size, size), Image.Resampling.LANCZOS)
    resized.save(path, format="PNG", optimize=True)


def main():
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    master = build_master()
    small_master = build_small_master()
    for size in (16, 32):
        save_resized(small_master, size, ASSET_DIR / f"icon-{size}.png")
    for size in (48, 128):
        save_resized(master, size, ASSET_DIR / f"icon-{size}.png")
    print("Generated extension icons.")


if __name__ == "__main__":
    main()
