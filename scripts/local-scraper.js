#!/usr/bin/env node
"use strict";
/**
 * Local Playwright Scraper for Amazon Brazil
 *
 * Run this script on your local machine to scrape products.
 * It uses your residential IP which won't be blocked by Amazon.
 *
 * USAGE:
 *   npx ts-node scripts/local-scraper.ts
 *   OR
 *   node scripts/local-scraper.js
 *
 * REQUIREMENTS:
 *   npm install playwright @playwright/test
 *   npx playwright install chromium
 *
 * This script will:
 * 1. Open a headless browser
 * 2. Navigate to Amazon deals pages
 * 3. Extract product information
 * 4. Send products to your Firebase instance
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
exports.scrapeAmazon = scrapeAmazon;
exports.uploadToFirebase = uploadToFirebase;
const playwright_1 = require("playwright");
const admin = __importStar(require("firebase-admin"));
const path = __importStar(require("path"));
// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
    // Firebase
    FIREBASE_SERVICE_ACCOUNT: process.env.FIREBASE_SERVICE_ACCOUNT || './service-account.json',
    FIREBASE_PROJECT_ID: 'ihuprojectmanager',
    // Amazon Partner Tag
    PARTNER_TAG: process.env.AMAZON_PARTNER_TAG || 'ihuofertas-20',
    // Scraping Settings - CONSERVATIVE/HUMAN-LIKE
    MAX_PRODUCTS_PER_PAGE: 15, // Limit products extracted per page
    DELAY_BETWEEN_PAGES_MIN_MS: 15000, // 15 seconds minimum between pages
    DELAY_BETWEEN_PAGES_MAX_MS: 25000, // 25 seconds maximum between pages
    SCROLL_DELAY_MS: 3000, // 3 seconds to "read" after scrolling
    PAGE_LOAD_TIMEOUT_MS: 30000,
    // Quality Filters
    MIN_PRICE: 25,
    MAX_PRICE: 2500,
    MIN_RATING: 3.0,
    MIN_REVIEWS: 10,
    MIN_DISCOUNT: 10,
};
// URLs to scrape
const SCRAPE_URLS = [
    { url: 'https://www.amazon.com.br/deals', category: 'deals', type: 'deals' },
    { url: 'https://www.amazon.com.br/gp/bestsellers/electronics', category: 'electronics', type: 'bestsellers' },
    { url: 'https://www.amazon.com.br/gp/bestsellers/kitchen', category: 'home', type: 'bestsellers' },
    { url: 'https://www.amazon.com.br/gp/bestsellers/sports', category: 'sports', type: 'bestsellers' },
    { url: 'https://www.amazon.com.br/gp/bestsellers/toys', category: 'toys', type: 'bestsellers' },
];
// Category keywords for normalization
const CATEGORY_KEYWORDS = {
    electronics: ['eletrônico', 'celular', 'smartphone', 'notebook', 'tablet', 'fone', 'tv', 'monitor', 'ssd', 'mouse', 'teclado', 'webcam', 'console', 'gamer'],
    home: ['casa', 'cozinha', 'eletrodoméstico', 'aspirador', 'cafeteira', 'airfryer', 'panela', 'ventilador'],
    sports: ['esporte', 'academia', 'fitness', 'bike', 'bicicleta', 'tênis', 'corrida', 'whey'],
    toys: ['brinquedo', 'lego', 'boneca', 'carrinho', 'jogo', 'nerf'],
};
// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function normalizeCategory(text) {
    const lower = text.toLowerCase();
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        if (keywords.some(kw => lower.includes(kw))) {
            return category;
        }
    }
    return 'other';
}
function calculateDealScore(product) {
    const discount = product.discount || 0;
    const rating = product.rating || 0;
    const reviews = product.reviewCount || 0;
    const category = product.normalizedCategory || 'other';
    const discountScore = Math.min((discount / 40) * 100, 100);
    const ratingScore = Math.max(((rating - 3) / 2) * 100, 0);
    const reviewScore = Math.min((Math.log10(Math.max(reviews, 1)) / Math.log10(5000)) * 100, 100);
    const categoryWeights = {
        electronics: 100, home: 80, sports: 75, toys: 70, other: 50
    };
    const categoryScore = categoryWeights[category] || 50;
    const sourceBonus = product.source === 'deals' ? 10 : 0;
    return Math.round(discountScore * 0.30 +
        ratingScore * 0.25 +
        reviewScore * 0.20 +
        categoryScore * 0.15 +
        sourceBonus);
}
function filterQualityProducts(products) {
    return products.filter(p => {
        if (!p.asin || p.asin.length !== 10)
            return false;
        if (!p.title || p.title.length < 10)
            return false;
        if (p.price < CONFIG.MIN_PRICE || p.price > CONFIG.MAX_PRICE)
            return false;
        if (p.rating > 0 && p.rating < CONFIG.MIN_RATING)
            return false;
        if (p.reviewCount > 0 && p.reviewCount < CONFIG.MIN_REVIEWS)
            return false;
        return true;
    });
}
// ============================================================================
// BROWSER SCRAPING
// ============================================================================
async function scrapeProductsFromPage(page, category, source) {
    const now = Date.now();
    // Extract products using page.evaluate
    const rawProducts = await page.evaluate(() => {
        const products = [];
        // Try multiple selector strategies
        const selectors = [
            '[data-asin]:not([data-asin=""])',
            '.zg-item-immersion',
            '.p13n-sc-uncoverable-faceout',
            '[data-deal-id]',
        ];
        const processedAsins = new Set();
        for (const selector of selectors) {
            document.querySelectorAll(selector).forEach((el) => {
                if (products.length >= 30)
                    return;
                try {
                    const $el = el;
                    // Extract ASIN
                    let asin = $el.getAttribute('data-asin') || '';
                    if (!asin) {
                        const link = $el.querySelector('a[href*="/dp/"]');
                        const href = link?.href || '';
                        const match = href.match(/\/dp\/([A-Z0-9]{10})/i);
                        asin = match ? match[1] : '';
                    }
                    if (!asin || asin.length !== 10 || processedAsins.has(asin))
                        return;
                    processedAsins.add(asin);
                    // Extract title
                    const titleEl = $el.querySelector('.p13n-sc-truncate, ._cDEzb_p13n-sc-css-line-clamp-3_g3dy1, h2 a span, .a-size-base-plus');
                    let title = titleEl?.textContent?.trim() || '';
                    if (!title) {
                        const img = $el.querySelector('img');
                        title = img?.alt || '';
                    }
                    if (!title || title.length < 5)
                        return;
                    // Try multiple price selectors
                    const priceSelectors = [
                        '.a-price .a-offscreen',
                        '.p13n-sc-price',
                        '._cDEzb_p13n-sc-price_3mJ9Z',
                        '.a-color-price',
                        'span[data-a-color="price"]',
                    ];
                    let price = 0;
                    for (const psel of priceSelectors) {
                        const priceEl = $el.querySelector(psel);
                        const priceText = priceEl?.textContent || '';
                        if (priceText) {
                            const cleaned = priceText
                                .replace(/[R$\s]/g, '')
                                .replace(/\.(?=\d{3})/g, '')
                                .replace(',', '.');
                            price = parseFloat(cleaned);
                            if (price > 0)
                                break;
                        }
                    }
                    // Extract original price
                    const oldPriceEl = $el.querySelector('.a-text-price .a-offscreen');
                    const oldPriceText = oldPriceEl?.textContent || '';
                    const oldPriceMatch = oldPriceText.match(/[\d.,]+/);
                    const originalPrice = oldPriceMatch ? parseFloat(oldPriceMatch[0].replace('.', '').replace(',', '.')) : 0;
                    // Extract discount
                    let discount = 0;
                    if (originalPrice > price && price > 0) {
                        discount = Math.round(((originalPrice - price) / originalPrice) * 100);
                    }
                    const discountEl = $el.querySelector('.a-badge-text, .savingsPercentage');
                    if (discount === 0 && discountEl) {
                        const discountMatch = discountEl.textContent?.match(/(\d+)%/);
                        discount = discountMatch ? parseInt(discountMatch[1], 10) : 0;
                    }
                    // Extract image
                    const imgEl = $el.querySelector('img');
                    const imageUrl = imgEl?.src || imgEl?.getAttribute('data-src') || '';
                    // Extract rating
                    const ratingEl = $el.querySelector('.a-icon-alt');
                    const ratingText = ratingEl?.textContent || '';
                    const ratingMatch = ratingText.match(/(\d[,.]?\d?)/);
                    const rating = ratingMatch ? parseFloat(ratingMatch[1].replace(',', '.')) : 0;
                    // Extract review count
                    const reviewEl = $el.querySelector('.a-size-small span');
                    const reviewText = reviewEl?.textContent || '';
                    const reviewMatch = reviewText.replace(/\./g, '').match(/(\d+)/);
                    const reviewCount = reviewMatch ? parseInt(reviewMatch[1], 10) : 0;
                    products.push({
                        asin,
                        title,
                        price,
                        originalPrice: originalPrice || undefined,
                        discount,
                        imageUrl,
                        rating,
                        reviewCount,
                    });
                }
                catch (err) {
                    // Skip malformed items
                }
            });
            if (products.length > 0)
                break;
        }
        return products;
    });
    // Process and enrich with category info
    return rawProducts.map(p => ({
        ...p,
        category,
        normalizedCategory: normalizeCategory(p.title),
        source,
        dealScore: 0,
        scrapedAt: now,
    })).map(p => ({
        ...p,
        dealScore: calculateDealScore(p),
    }));
}
async function scrapeAmazon(browser) {
    const page = await browser.newPage();
    let allProducts = [];
    // Set realistic viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    for (const source of SCRAPE_URLS) {
        console.log(`\n📦 Scraping: ${source.url}`);
        try {
            await page.goto(source.url, {
                waitUntil: 'domcontentloaded',
                timeout: CONFIG.PAGE_LOAD_TIMEOUT_MS,
            });
            // Wait for products to load
            await page.waitForSelector('[data-asin], .zg-item-immersion', {
                timeout: 10000
            }).catch(() => console.log('  ⚠️ Product selector not found, trying anyway...'));
            // Scroll slowly to simulate human reading
            console.log('  📖 Scrolling and reading page...');
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 3));
            await sleep(CONFIG.SCROLL_DELAY_MS);
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
            await sleep(CONFIG.SCROLL_DELAY_MS);
            const products = await scrapeProductsFromPage(page, source.category, source.type);
            console.log(`  ✅ Found ${products.length} products`);
            allProducts = allProducts.concat(products);
            // Random delay between pages (human-like)
            if (SCRAPE_URLS.indexOf(source) < SCRAPE_URLS.length - 1) {
                const delay = Math.floor(Math.random() * (CONFIG.DELAY_BETWEEN_PAGES_MAX_MS - CONFIG.DELAY_BETWEEN_PAGES_MIN_MS) + CONFIG.DELAY_BETWEEN_PAGES_MIN_MS);
                console.log(`  ⏳ Waiting ${Math.round(delay / 1000)}s before next page...`);
                await sleep(delay);
            }
        }
        catch (error) {
            console.error(`  ❌ Error scraping ${source.url}:`, error);
        }
    }
    await page.close();
    return allProducts;
}
// ============================================================================
// FIREBASE UPLOAD
// ============================================================================
async function uploadToFirebase(products) {
    // Initialize Firebase
    const serviceAccountPath = path.resolve(CONFIG.FIREBASE_SERVICE_ACCOUNT);
    try {
        const serviceAccount = require(serviceAccountPath);
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                projectId: CONFIG.FIREBASE_PROJECT_ID,
            });
        }
    }
    catch (error) {
        console.error('❌ Failed to load service account. Make sure service-account.json exists.');
        console.error('   Download it from Firebase Console > Project Settings > Service Accounts');
        throw error;
    }
    const db = admin.firestore();
    const batch = db.batch();
    let newCount = 0;
    let updateCount = 0;
    for (const product of products) {
        const docRef = db.collection('products').doc(product.asin);
        const existing = await docRef.get();
        const productData = {
            asin: product.asin,
            title: product.title,
            price: product.price,
            originalPrice: product.originalPrice || null,
            discount: product.discount,
            imageUrl: product.imageUrl,
            affiliateLink: `https://www.amazon.com.br/dp/${product.asin}?tag=${CONFIG.PARTNER_TAG}`,
            category: product.normalizedCategory,
            rating: product.rating,
            reviewCount: product.reviewCount,
            dealScore: product.dealScore,
            source: product.source,
            fetchedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (existing.exists) {
            batch.update(docRef, {
                price: product.price,
                originalPrice: product.originalPrice || null,
                discount: product.discount,
                dealScore: product.dealScore,
                fetchedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            updateCount++;
        }
        else {
            batch.set(docRef, {
                ...productData,
                posted: false,
                clicks: 0,
            });
            newCount++;
        }
    }
    await batch.commit();
    return { newCount, updateCount };
}
// ============================================================================
// MAIN
// ============================================================================
async function main() {
    console.log('🚀 Starting Local Amazon Scraper');
    console.log('='.repeat(60));
    const startTime = Date.now();
    let browser = null;
    try {
        // Launch browser
        console.log('🌐 Launching browser...');
        browser = await playwright_1.chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        // Scrape products
        let products = await scrapeAmazon(browser);
        console.log(`\n📊 Total scraped: ${products.length} products`);
        // Deduplicate
        const seen = new Map();
        for (const p of products) {
            const existing = seen.get(p.asin);
            if (!existing || p.dealScore > existing.dealScore) {
                seen.set(p.asin, p);
            }
        }
        products = Array.from(seen.values());
        console.log(`📊 After deduplication: ${products.length}`);
        // Filter quality
        products = filterQualityProducts(products);
        console.log(`📊 After quality filter: ${products.length}`);
        // Sort and take top 20
        products.sort((a, b) => b.dealScore - a.dealScore);
        const topProducts = products.slice(0, 20);
        console.log('\n🏆 Top 10 Products:');
        topProducts.slice(0, 10).forEach((p, i) => {
            console.log(`  ${i + 1}. [Score: ${p.dealScore}] ${p.title.substring(0, 50)}... - R$${p.price}`);
        });
        // Upload to Firebase
        console.log('\n☁️ Uploading to Firebase...');
        const { newCount, updateCount } = await uploadToFirebase(topProducts);
        // Summary
        const duration = (Date.now() - startTime) / 1000;
        console.log('\n' + '='.repeat(60));
        console.log('✅ SCRAPING COMPLETE');
        console.log('='.repeat(60));
        console.log(`⏱️  Duration: ${duration.toFixed(1)}s`);
        console.log(`📦 Products uploaded: ${topProducts.length}`);
        console.log(`🆕 New products: ${newCount}`);
        console.log(`🔄 Updated products: ${updateCount}`);
        console.log('='.repeat(60));
    }
    catch (error) {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    }
    finally {
        if (browser) {
            await browser.close();
        }
    }
}
// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}
