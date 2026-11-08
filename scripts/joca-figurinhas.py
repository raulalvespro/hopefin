#!/usr/bin/env python3
"""Gera as 4 figurinhas do Joca (WebP 512x512, fundo transparente, contorno branco grosso, texto desenhado em código).

Uso:  py scripts/joca-figurinhas.py
Entrada: public/joca/joca-<pose>-640.webp (saída do joca-processar.py)
Saída:   docs/design/mascote/figurinhas/figurinha-<nome>.webp  (cada uma abaixo de 100 KB, exigência do WhatsApp)
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi

RAIZ = Path(__file__).resolve().parent.parent
ENTRADA = RAIZ / "public" / "joca"
SAIDA = RAIZ / "docs" / "design" / "mascote" / "figurinhas"
SAIDA.mkdir(parents=True, exist_ok=True)

LADO = 512
CONTORNO = 12           # espessura do contorno branco do personagem (px)
VERDE_ESCURO = (6, 78, 59, 255)   # texto
BRANCO = (255, 255, 255, 255)
FONTES = ["C:/Windows/Fonts/ARLRDBD.TTF", "C:/Windows/Fonts/arialbd.ttf"]

# (arquivo, pose, texto)
FIGURINHAS = [
    ("anotado", "anotando", "Anotado!"),
    ("conta-paga", "construindo", "Conta paga!"),
    ("mes-no-azul", "comemorando", "Mês no azul!"),
    ("vence-amanha", "preocupado", "Opa, vence amanhã"),
]


def fonte(tamanho):
    for f in FONTES:
        if Path(f).exists():
            return ImageFont.truetype(f, tamanho)
    return ImageFont.load_default()


def contorno_branco(img, esp):
    """Contorno branco grosso e liso ao redor do que não é transparente."""
    a = np.asarray(img.getchannel("A")) > 20
    mascara = np.pad(a, esp + 2)
    n = ndi.binary_dilation(mascara, structure=np.ones((3, 3)), iterations=esp)
    n = ndi.binary_closing(n, structure=np.ones((3, 3)), iterations=4)
    n = ndi.gaussian_filter(n.astype(float), 1.2)
    n = n[esp + 2:-(esp + 2), esp + 2:-(esp + 2)]
    camada = np.zeros((*n.shape, 4), dtype=np.uint8)
    camada[..., :3] = 255
    camada[..., 3] = np.clip(n * 255, 0, 255).astype(np.uint8)
    return Image.fromarray(camada, "RGBA")


def texto_ajustado(texto, largura_max):
    tam = 74
    while tam > 28:
        f = fonte(tam)
        caixa = f.getbbox(texto, stroke_width=8)
        if caixa[2] - caixa[0] <= largura_max:
            return f
        tam -= 2
    return fonte(28)


for nome, pose, texto in FIGURINHAS:
    joca = Image.open(ENTRADA / f"joca-{pose}-640.webp").convert("RGBA")
    caixa = joca.getchannel("A").point(lambda v: 255 if v > 12 else 0).getbbox()
    joca = joca.crop(caixa)
    altura_util = 372  # o resto da altura fica para o texto
    escala = min(altura_util / joca.height, (LADO - 2 * (CONTORNO + 8)) / joca.width)
    joca = joca.resize((int(joca.width * escala), int(joca.height * escala)), Image.LANCZOS)

    tela = Image.new("RGBA", (LADO, LADO), (0, 0, 0, 0))
    x = (LADO - joca.width) // 2
    y = 14 + CONTORNO
    base = Image.new("RGBA", (LADO, LADO), (0, 0, 0, 0))
    base.paste(joca, (x, y), joca)
    tela = Image.alpha_composite(tela, contorno_branco(base, CONTORNO))
    tela = Image.alpha_composite(tela, base)

    # Texto: verde-escuro com contorno branco grosso (lê bem em fundo claro e escuro)
    d = ImageDraw.Draw(tela)
    f = texto_ajustado(texto, LADO - 40)
    d.text((LADO // 2, LADO - 54), texto, font=f, fill=VERDE_ESCURO, anchor="mm", stroke_width=8, stroke_fill=BRANCO)

    destino = SAIDA / f"figurinha-{nome}.webp"
    for q in (92, 85, 78, 70, 60):
        tela.save(destino, "WEBP", quality=q, method=6)
        if destino.stat().st_size < 100 * 1024:
            break
    print(destino.name, f"{destino.stat().st_size / 1024:.1f} KB")
print("ok")
