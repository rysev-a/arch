#!/usr/bin/env python3
"""Растровые значки сайта (favicon.ico и apple-touch-icon.png) по рисунку логотипа из шапки.

Основной значок — public/favicon.svg (он сам подстраивается под тёмную и светлую тему системы);
этот скрипт делает запасные для браузеров без поддержки SVG-значков и для экрана «Домой» на iOS.
Запуск: python3 scripts/make-favicon.py   (нужен Pillow)
"""
from PIL import Image, ImageDraw

BG = (250, 250, 250)   # плашка: hsl(0 0% 98%), как в тёмной теме сайта
FG = (24, 24, 27)      # значок: hsl(240 5.9% 10%)
SS = 8                 # сглаживание: рисуем крупнее и уменьшаем


def draw(size: int) -> Image.Image:
    n = size * SS
    img = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, n - 1, n - 1], radius=n * 14 / 64, fill=BG)

    k = n / 64 * 1.7              # масштаб значка внутри плашки (как в svg)
    ox = oy = n / 64 * 11.2
    w = max(1, round(1.9 * k))

    def p(x: float, y: float) -> tuple[float, float]:
        return ox + x * k, oy + y * k

    # корпус микросхемы: квадрат со скруглёнными углами
    (x0, y0), (x1, y1) = p(7, 7), p(17, 17)
    d.rounded_rectangle([x0, y0, x1, y1], radius=1.5 * k, outline=FG, width=w)

    # восемь выводов; круглые концы — кружками
    pins = [
        ((10, 2), (10, 5)), ((14, 2), (14, 5)), ((10, 19), (10, 22)), ((14, 19), (14, 22)),
        ((2, 10), (5, 10)), ((2, 14), (5, 14)), ((19, 10), (22, 10)), ((19, 14), (22, 14)),
    ]
    for a, b in pins:
        pa, pb = p(*a), p(*b)
        d.line([pa, pb], fill=FG, width=w)
        for cx, cy in (pa, pb):
            d.ellipse([cx - w / 2, cy - w / 2, cx + w / 2, cy + w / 2], fill=FG)

    return img.resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    sizes = [16, 32, 48]
    draw(256).save('public/favicon.ico', format='ICO', sizes=[(s, s) for s in sizes])
    # на экране «Домой» iOS сама скругляет углы и не любит прозрачность: рисуем на сплошном фоне
    icon = draw(180)
    flat = Image.new('RGB', (180, 180), BG)
    flat.paste(icon, mask=icon.split()[3])
    flat.save('public/apple-touch-icon.png')
    print('готово: public/favicon.ico', sizes, 'и public/apple-touch-icon.png')
