# Hub de Afiliados Amazon

Sistema automático para gerar imagens promocionais de produtos da Amazon com rastreamento de cliques.

## 🚀 Funcionalidades

- **Geração de Criativos**: Cria imagens promocionais automaticamente
- **Scraping Amazon**: Busca dados de produtos (preço, título, imagem)
- **Rastreamento**: Conta cliques em cada produto
- **Fonte Customizada**: Usa fonte Figtree para visual profissional

## 📋 Pré-requisitos

- Node.js 18+
- Conta Firebase
- Firebase CLI instalado

## ⚙️ Instalação

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

## 🎨 Configuração do Layout

Edite as constantes em `functions/src/creativeGenerator.ts`:

```typescript
TEMPLATE = {
  PRODUCT_WIDTH: 800,      // Largura da imagem do produto
  PRODUCT_HEIGHT: 600,     // Altura da imagem do produto
  PRODUCT_FIT: "cover",    // "cover" | "contain" | "fill"
  TITLE_OPACITY: 0.8,      // Opacidade do título (0.0 a 1.0)
}
```

### Modos de Ajuste da Imagem:
- **`cover`**: Preenche toda área (pode cortar bordas)
- **`contain`**: Cabe sem cortar (pode ter espaços vazios)
- **`fill`**: Estica para preencher (pode distorcer)

## 🧪 Testar Localmente

```bash
cd functions
npm run test-creative
```

A imagem será salva em `functions/lib/test-creative.jpg`

## 🚀 Deploy

```bash
cd functions
npm run deploy
```

## 📡 Endpoints

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

## 📁 Estrutura

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

## 🔐 Segurança

**Nunca commite:**
- `service-account.json`
- `.env`
- Credenciais Firebase

Esses arquivos já estão no `.gitignore`.

## 📝 Licença

Projeto privado - Todos os direitos reservados
