#!/usr/bin/env node
/**
 * Test Script - Runs the local scraper without Firebase upload
 * 
 * USAGE: npx ts-node test-scraper.ts
 */

import { chromium, Browser, Page } from 'playwright';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    MAX_PRODUCTS_PER_PAGE: 30,
    DELAY_BETWEEN_PAGES_MS: 3000,
    PAGE_LOAD_TIMEOUT_MS: 30000,
    MIN_PRICE: 25,
    MAX_PRICE: 2500,
};

// URLs to test
const TEST_URLS = [
    { url: 'https://www.amazon.com.br/gp/bestsellers/electronics', category: 'electronics', type: 'bestsellers' as const },
];

interface ScrapedProduct {
    asin: string;
    title: string;
    price: number;
    originalPrice?: number;
    discount: number;
    imageUrl: string;
    rating: number;
    reviewCount: number;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeProductsFromPage(page: Page): Promise<ScrapedProduct[]> {
    // Extract products using page.evaluate
    const rawProducts = await page.evaluate(() => {
        const products: any[] = [];
        const processedAsins = new Set<string>();

        const selectors = [
            '[data-asin]:not([data-asin=""])',
            '.zg-item-immersion',
            '.p13n-sc-uncoverable-faceout',
        ];

        for (const selector of selectors) {
            document.querySelectorAll(selector).forEach((el) => {
                if (products.length >= 30) return;

                try {
                    const $el = el as HTMLElement;

                    let asin = $el.getAttribute('data-asin') || '';
                    if (!asin) {
                        const link = $el.querySelector('a[href*="/dp/"]') as HTMLAnchorElement;
                        const href = link?.href || '';
                        const match = href.match(/\/dp\/([A-Z0-9]{10})/i);
                        asin = match ? match[1] : '';
                    }

                    if (!asin || asin.length !== 10 || processedAsins.has(asin)) return;
                    processedAsins.add(asin);

                    const titleEl = $el.querySelector('.p13n-sc-truncate, ._cDEzb_p13n-sc-css-line-clamp-3_g3dy1, h2 a span, .a-size-base-plus');
                    let title = titleEl?.textContent?.trim() || '';
                    if (!title) {
                        const img = $el.querySelector('img') as HTMLImageElement;
                        title = img?.alt || '';
                    }

                    if (!title || title.length < 5) return;

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
                            // Parse Brazilian price format: "R$ 1.234,56" -> 1234.56
                            const cleaned = priceText
                                .replace(/[R$\s]/g, '')
                                .replace(/\.(?=\d{3})/g, '') // Remove thousand separators
                                .replace(',', '.'); // Convert decimal separator
                            price = parseFloat(cleaned);
                            if (price > 0) break;
                        }
                    }

                    const oldPriceEl = $el.querySelector('.a-text-price .a-offscreen');
                    const oldPriceText = oldPriceEl?.textContent || '';
                    const oldPriceMatch = oldPriceText.match(/[\d.,]+/);
                    const originalPrice = oldPriceMatch ? parseFloat(oldPriceMatch[0].replace('.', '').replace(',', '.')) : 0;

                    let discount = 0;
                    if (originalPrice > price && price > 0) {
                        discount = Math.round(((originalPrice - price) / originalPrice) * 100);
                    }

                    const imgEl = $el.querySelector('img') as HTMLImageElement;
                    const imageUrl = imgEl?.src || imgEl?.getAttribute('data-src') || '';

                    const ratingEl = $el.querySelector('.a-icon-alt');
                    const ratingText = ratingEl?.textContent || '';
                    const ratingMatch = ratingText.match(/(\d[,.]?\d?)/);
                    const rating = ratingMatch ? parseFloat(ratingMatch[1].replace(',', '.')) : 0;

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
                } catch (err) {
                    // Skip malformed items
                }
            });

            if (products.length > 0) break;
        }

        return products;
    });

    return rawProducts;
}

async function main() {
    console.log('🧪 Test Mode - Local Amazon Scraper');
    console.log('='.repeat(60));
    console.log('This tests the scraping functionality without Firebase upload.');
    console.log('='.repeat(60));

    let browser: Browser | null = null;

    try {
        console.log('\n🌐 Launching browser...');
        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        const page = await browser.newPage();
        await page.setViewportSize({ width: 1920, height: 1080 });

        for (const source of TEST_URLS) {
            console.log(`\n📦 Testing: ${source.url}`);

            try {
                await page.goto(source.url, {
                    waitUntil: 'domcontentloaded',
                    timeout: CONFIG.PAGE_LOAD_TIMEOUT_MS,
                });

                console.log('  ⏳ Waiting for products to load...');
                await page.waitForSelector('[data-asin], .zg-item-immersion', {
                    timeout: 10000
                }).catch(() => console.log('  ⚠️ Selector timeout, trying anyway...'));

                // Scroll to load lazy content
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
                await sleep(2000);

                const products = await scrapeProductsFromPage(page);

                console.log(`\n  ✅ Found ${products.length} products!\n`);

                if (products.length > 0) {
                    console.log('  📋 Sample products:\n');
                    products.slice(0, 5).forEach((p, i) => {
                        console.log(`  ${i + 1}. ${p.title.substring(0, 50)}...`);
                        console.log(`     ASIN: ${p.asin} | R$${p.price} | ⭐${p.rating} | ${p.reviewCount} reviews`);
                        console.log('');
                    });
                }

            } catch (error) {
                console.error(`  ❌ Error:`, error);
            }
        }

        await page.close();

        console.log('\n' + '='.repeat(60));
        console.log('✅ TEST COMPLETE');
        console.log('='.repeat(60));
        console.log('\nIf products were found, you can run the full scraper with:');
        console.log('  npm run scrape\n');
        console.log('Make sure to add service-account.json first!');

    } catch (error) {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

main().catch(console.error);
