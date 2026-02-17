# Hub de Afiliados Amazon

Sistema automático para gerar imagens promocionais de produtos da Amazon com rastreamento de cliques.

## Funcionalidades

- **Geração de Criativos**: Cria imagens promocionais automaticamente
- **Scraping Amazon**: Busca dados de produtos (preço, título, imagem)
- **Rastreamento**: Conta cliques em cada produto

## Pré-requisitos

- Node.js 18+
- Conta Firebase
- Firebase CLI instalado

## Instalação

```bash
# Clonar repositório
git clone https://github.com/Dsptt/projeto_afiliados.git
cd projeto_afiliados

# Instalar dependências
cd functions
npm install

# Configurar Firebase
firebase login
firebase use --add
```

## Testar Localmente

```bash
cd functions
npm run test-creative
```

A imagem será salva em `functions/lib/test-creative.jpg`

## Deploy

```bash
cd functions
npm run deploy
```

## Endpoints

### Gerar criativo de um produto
```
POST /generateCreative
Body: { "asin": "B0XXXXXX" }
```

### Gerar todos os criativos
```
GET /generateAllCreatives
```

### Rastreamento de cliques
```
GET /r/:productId
```

## Estrutura

```
projeto_afiliados/
├── functions/
│   ├── src/
│   │   ├── creativeGenerator.ts    # Gerador de imagens
│   │   ├── scraper/                # Scrapers Amazon
│   │   └── index.ts                # Endpoints
│   └── assets/                     # Fontes e templates
└── scripts/                        # Scripts auxiliares
```

## Licença

Projeto pessoal/privado
