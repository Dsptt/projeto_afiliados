# Local Amazon Scraper

Scraper local em Playwright para descobrir produtos da Amazon Brasil.

## Por que Local?

A Amazon bloqueia requisições de servidores em nuvem (Cloud Functions, AWS, etc). 
Este script roda no seu computador usando seu IP residencial, que não é bloqueado.

## Requisitos

- Node.js 18+ instalado
- Conta de serviço do Firebase (`service-account.json`)

## Instalação

```bash
cd scripts

# Instalar dependências
npm install

# Instalar navegador Chromium
npx playwright install chromium
```

## Configuração

1. **Baixar credenciais Firebase:**
   - Acesse [Firebase Console](https://console.firebase.google.com/project/ihuprojectmanager/settings/serviceaccounts/adminsdk)
   - Clique em "Gerar nova chave privada"
   - Salve como `service-account.json` nesta pasta

2. **Configurar variáveis (opcional):**
   ```bash
   export AMAZON_PARTNER_TAG="seu-tag-20"
   ```

## Uso

```bash
# Rodar scraper (recomendado: 1x por dia pela manhã)
npm run scrape

# Ou diretamente
npx ts-node local-scraper.ts
```

## O que o script faz

1. 🌐 Abre um navegador Chromium (invisível)
2. 📦 Acessa páginas de deals e bestsellers da Amazon
3. 🔍 Extrai informações dos produtos (título, preço, desconto, avaliação)
4. 📊 Calcula score de qualidade baseado em desconto + avaliação + reviews
5. ☁️ Envia os 20 melhores produtos para o Firebase

## Automação (Opcional)

Para rodar automaticamente todo dia às 8h, adicione ao crontab:

```bash
# Editar crontab
crontab -e

# Adicionar linha:
0 8 * * * cd /home/eduardo/Documentos/affi_project/scripts && /usr/bin/node local-scraper.js >> scraper.log 2>&1
```

## Saída Esperada

```
🚀 Starting Local Amazon Scraper
============================================================
🌐 Launching browser...

📦 Scraping: https://www.amazon.com.br/deals
  ✅ Found 25 products
  ⏳ Waiting 5s...

📦 Scraping: https://www.amazon.com.br/gp/bestsellers/electronics
  ✅ Found 30 products
...

📊 Total scraped: 85 products
📊 After deduplication: 72
📊 After quality filter: 45

🏆 Top 10 Products:
  1. [Score: 78] Echo Dot 5ª Geração... - R$279
  2. [Score: 75] Fone Bluetooth JBL... - R$189
...

☁️ Uploading to Firebase...

============================================================
✅ SCRAPING COMPLETE
============================================================
⏱️  Duration: 45.3s
📦 Products uploaded: 20
🆕 New products: 15
🔄 Updated products: 5
============================================================
```

## Troubleshooting

| Problema | Solução |
|----------|---------|
| `Cannot find module 'playwright'` | Rode `npm install` |
| `Executable doesn't exist` | Rode `npx playwright install chromium` |
| `Failed to load service account` | Baixe o arquivo do Firebase Console |
| `PERMISSION_DENIED` | Verifique se o service account tem permissões de Firestore |
