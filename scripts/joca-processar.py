#!/usr/bin/env python3
"""Processa as imagens do Joca: tira o fundo (rembg), conserta o peito branco, recorta e gera WebP responsivo.

Uso:  py scripts/joca-processar.py
Entrada: docs/design/mascote/originais/joca-<pose>.(png|jpg)
Saída:   public/joca/joca-<pose>-640.webp e -320.webp (fundo transparente, com margem) + public/joca/manifest.json
Requer:  pip install rembg onnxruntime pillow scipy   (o modelo é baixado na 1ª execução)
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from rembg import remove, new_session
from scipy import ndimage as ndi

RAIZ = Path(__file__).resolve().parent.parent
ENTRADA = RAIZ / "docs" / "design" / "mascote" / "originais"
SAIDA = RAIZ / "public" / "joca"
POSES = ["base", "anotando", "comemorando", "preocupado", "construindo"]
TAMANHOS = [640, 320]
FECHA = {"anotando": 16}  # poses com destaque branco no peito precisam fechar buracos maiores
MARGEM = 0.04  # respiro ao redor do personagem

SAIDA.mkdir(parents=True, exist_ok=True)


def corrigir(original, recorte, fecha=5):
    """O recorte automático confunde o peito branco/creme e o branco dos olhos com o fundo (deixa furos).
    Aqui: (1) o peito é recuperado pela cor creme (o fundo é cinza-azulado, o peito é quente: R > B);
    (2) buracos pequenos são fechados e preenchidos; (3) onde o recorte falhou, volta o pixel original."""
    o = np.asarray(original.convert("RGB")).astype(int)
    r = np.asarray(recorte).astype(np.uint8).copy()
    a = r[..., 3].astype(int)
    lum = (o[..., 0] * 3 + o[..., 1] * 6 + o[..., 2]) // 10
    quente = ((o[..., 0] - o[..., 2]) >= 3) & (lum > 150) & (o[..., 1] - o[..., 0] < 25)       # creme do peito / pedra da casinha
    perto = ndi.binary_dilation(a > 128, iterations=30)           # só perto do personagem
    # cinza claro (peito na sombra do braço/celular): só acima do nível dos pés, para não pegar a sombra do chão
    ys = np.where((a > 128).any(axis=1))[0]
    corte_y = ys.min() + 0.9 * (ys.max() - ys.min())
    linhas = np.arange(a.shape[0])[:, None]
    neutro = ((o.max(axis=2) - o.min(axis=2)) < 14) & (lum > 150) & (lum < 238) & (linhas < corte_y)
    m = (a > 128) | (quente & perto) | (neutro & perto)
    m5 = ndi.binary_closing(m, structure=np.ones((3, 3)), iterations=5)
    if fecha > 5:  # fechamento forte só do tronco para baixo (não mexe na cabeça nem no broto)
        forte = ndi.binary_closing(m, structure=np.ones((3, 3)), iterations=fecha)
        m = np.where(linhas > ys.min() + 0.3 * (ys.max() - ys.min()), forte, m5)
    else:
        m = m5
    m = ndi.binary_fill_holes(m)
    interior = ndi.binary_erosion(m, iterations=1)
    falhou = interior & (a < 250)
    r[..., :3][falhou] = o[falhou].astype(np.uint8)               # cor original onde o recorte errou
    novo = np.maximum(a, interior * 255)
    novo = ndi.gaussian_filter(novo.astype(float), 0.6)           # borda suave
    r[..., 3] = np.clip(novo, 0, 255).astype(np.uint8)
    return Image.fromarray(r, "RGBA")


sessao = new_session("isnet-general-use")
manifesto = {}

for pose in POSES:
    arq = next((p for p in ENTRADA.glob(f"joca-{pose}.*")), None)
    if not arq:
        print("faltando:", pose)
        continue
    img = Image.open(arq).convert("RGBA").resize((1024, 1024), Image.LANCZOS)  # 1024 px basta (o app usa até 640)
    sem_fundo = remove(img, session=sessao, alpha_matting=True,
                       alpha_matting_foreground_threshold=240,
                       alpha_matting_background_threshold=15,
                       alpha_matting_erode_size=8)
    sem_fundo = corrigir(img, sem_fundo, fecha=FECHA.get(pose, 5))
    caixa = sem_fundo.getchannel("A").point(lambda v: 255 if v > 12 else 0).getbbox()
    sem_fundo = sem_fundo.crop(caixa)
    lado = int(max(sem_fundo.size) * (1 + 2 * MARGEM))
    tela = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
    tela.paste(sem_fundo, ((lado - sem_fundo.width) // 2, (lado - sem_fundo.height) // 2), sem_fundo)
    manifesto[pose] = {}
    for t in TAMANHOS:
        destino = SAIDA / f"joca-{pose}-{t}.webp"
        tela.resize((t, t), Image.LANCZOS).save(destino, "WEBP", quality=86, method=6)
        manifesto[pose][t] = {"arquivo": destino.name, "kb": round(destino.stat().st_size / 1024, 1)}
    print(pose, manifesto[pose])

(SAIDA / "manifest.json").write_text(json.dumps(manifesto, indent=2, ensure_ascii=False), encoding="utf-8")
print("ok")
