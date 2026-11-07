# HopeFin — mascote Joca (decisões e prompts 3D)

Atualizado em 06/11/2026.

## Decisões
- Nome: **Joca**, um joão-de-barro.
- Base visual: **versão 1 (verde)** do canvas Telas de entrada, página "Mascote" (https://claude.ai/artifact/WCTb5Dr9hpPmEZPZTkWibd).
- Acabamento: **3D**, estilo massinha / vinil fosco.
- Precisa passar: **confiável, leve e moderno**. Não pode parecer infantil.
- Frase-mãe: "Tijolinho por tijolinho, a casa fica de pé."
- Cores:
  - corpo #10B981;
  - asa #059669;
  - peito branco;
  - bico e patas #F59E0B;
  - broto #34D399;
  - casinha de barro #C2763D.
- Regras:
  - sempre com o broto na cabeça;
  - nada de dinheiro voando;
  - no máximo preocupado, nunca desesperado;
  - o broto cresce quando o mês fecha no azul.

## Prompt base (em inglês, que rende melhor nos geradores)

```
3D character design of "Joca", a friendly ovenbird mascot for a family finance app.
Upright, slightly elongated bird body in emerald green (#10B981), clean white chest,
darker green wing (#059669), slim amber beak and thin amber legs (#F59E0B),
a small two-leaf sprout in mint green (#34D399) growing from the top of the head.
Calm, confident eyes with subtle eyelids. Adult proportions: medium-sized head,
no blush, no oversized eyes, no baby features.
Soft matte clay / vinyl toy material, smooth rounded forms, subtle subsurface,
soft studio lighting, gentle shadow, light neutral background (#F6F7F9).
Modern, trustworthy, light, premium brand mascot, fintech app style.
Full body, three-quarter front view, centered, clean composition.
```

Evitar (no Midjourney, use `--no`; nos outros, escreva "avoid: ..."):

```
childish, baby proportions, huge eyes, blush cheeks, glossy plastic, realistic feathers,
text, letters, logo, money bills, scary, cluttered background
```

Configuração sugerida no Midjourney: `--ar 1:1 --style raw --stylize 150`.

## Variações (mantenha o prompt base e troque só a ação)

- **Anotando**: "holding a smartphone with one wing, looking at the screen with a small satisfied smile, a green check mark bubble floating next to the phone"
- **Comemorando**: "both wings raised in celebration, eyes closed with a smile, a few small mint and amber confetti pieces around"
- **Preocupado**: "holding a paper bill with one wing, slightly worried look with raised inner eyebrows, a small sweat drop, still calm and friendly"
- **Construindo**: "placing a small clay brick on a dome-shaped clay ovenbird nest (#C2763D), focused and proud"
- **Folha de personagem**: "character turnaround sheet of the same character: front, three-quarter, side and back views, plus 4 facial expressions, consistent design, white background"
- **Figurinha de WhatsApp**: "sticker style, thick white outline around the character, plain white background, one short word in bold rounded font: '{texto}'"

## Como manter o Joca igual em todas as imagens
1. Gere a pose base até gostar de uma. Essa imagem vira o Joca oficial.
2. Use essa imagem como **referência de personagem** em todas as próximas: no Midjourney é a opção de referência de personagem; no ChatGPT e no Ideogram, anexe a imagem e peça "same character".
3. Repita sempre o mesmo prompt base e mude só a ação.
4. Para figurinha com fundo transparente, tire o fundo com o remove.bg (https://remove.bg) e salve em 512 x 512.

## Ferramentas
- Midjourney — https://midjourney.com
- ChatGPT (gerador de imagem) — https://chatgpt.com
- Ideogram — https://ideogram.ai
- Leonardo — https://leonardo.ai

## Cuidados
- Use plano pago, que libera o uso comercial nos termos de cada ferramenta.
- A proteção de direito autoral sobre imagem feita só por IA ainda é incerta. Para registrar o Joca como marca e ter exclusividade de verdade, vale um ilustrador ou artista 3D refinar a versão escolhida depois.
