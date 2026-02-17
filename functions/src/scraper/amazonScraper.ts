/**
 * Amazon Brazil Scraper - Cheerio-based product discovery
 * 
 * SAFETY FEATURES:
 * - Rate limiting with configurable delays
 * - Request limits per session
 * - User-agent rotation
 * - Retry with exponential backoff
 * - Graceful degradation on errors
 */

import * as cheerio from "cheerio";
import fetch from "node-fetch";

// ============================================================================
// CONFIGURATION - Safety & Rate Limiting
// ============================================================================

const CONFIG = {
    // Maximum requests per scraping session (hard limit)
    MAX_REQUESTS_PER_SESSION: 6,

    // Delay between requests (ms) - randomized between min and max
    DELAY_MIN_MS: 8000,  // 8 seconds minimum
    DELAY_MAX_MS: 15000, // 15 seconds maximum

    // Retry configuration
    MAX_RETRIES: 2,
    RETRY_DELAY_MS: 5000,

    // Request timeout
    TIMEOUT_MS: 30000,

    // Maximum products to process per source
    MAX_PRODUCTS_PER_SOURCE: 25,

    // Quality filter thresholds
    MIN_PRICE: 25,
    MAX_PRICE: 2500,
    MIN_RATING: 3.0,
    MIN_REVIEWS: 10,
};

// ============================================================================
// CATEGORY CONFIGURATION
// ============================================================================

const CATEGORY_MAPPING: Record<string, string[]> = {
    electronics: [
        "Eletrônicos", "TV, Áudio e Cinema em Casa", "PC e Eletrônicos Portáteis",
        "Celulares", "Câmera e Fotografia", "Videogames e Consoles",
        "Acessórios para Eletrônicos", "Informática", "Games", "Computadores",
        "Tablets", "Fones de Ouvido", "Smart Home", "Wearables",
    ],
    home: [
        "Casa", "Eletrodomésticos de Linha Branca", "Cozinha, Jardim e Piscina",
        "Móveis", "Ferramentas e Construção", "Eletrodomésticos", "Cozinha",
        "Decoração", "Organização", "Limpeza", "Iluminação",
    ],
    sports: [
        "Esportes, Aventura e Lazer", "Esportes", "Academia", "Fitness", "Outdoor",
        "Camping", "Ciclismo", "Natação", "Corrida", "Musculação",
    ],
    toys: [
        "Brinquedos e Jogos", "Brinquedos", "Games", "Jogos de Tabuleiro",
        "LEGO", "Bonecas", "Carrinhos", "Jogos Eletrônicos",
    ],
};

const CATEGORY_ALIASES: Record<string, string[]> = {
    sports: ["esporte", "esportes", "academia", "fitness", "aventura", "outdoor", "camping", "ciclismo", "bike", "corrida"],
    electronics: ["eletrônico", "eletronico", "tech", "tecnologia", "celular", "smartphone", "computador", "pc", "gamer", "notebook", "tablet", "fone"],
    home: ["casa", "lar", "cozinha", "jardim", "móvel", "movel", "decoração", "decoracao", "eletrodomestico", "limpeza"],
    toys: ["brinquedo", "brinquedos", "jogos", "infantil", "criança", "lego", "boneca"],
};

const CATEGORY_WEIGHTS: Record<string, number> = {
    electronics: 100,
    home: 80,
    sports: 75,
    toys: 70,
    other: 40,
};

// ============================================================================
// URLS TO SCRAPE
// ============================================================================

const AMAZON_BASE = "https://www.amazon.com.br";

// Multiple URLs per category for better coverage
const SCRAPE_SOURCES: { url: string; category: string; type: "deals" | "bestsellers" }[] = [
    // Deals page (general)
    { url: `${AMAZON_BASE}/deals`, category: "general", type: "deals" },

    // Bestsellers by category
    { url: `${AMAZON_BASE}/gp/bestsellers/electronics`, category: "electronics", type: "bestsellers" },
    { url: `${AMAZON_BASE}/gp/bestsellers/kitchen`, category: "home", type: "bestsellers" },
    { url: `${AMAZON_BASE}/gp/bestsellers/sports`, category: "sports", type: "bestsellers" },
    { url: `${AMAZON_BASE}/gp/bestsellers/toys`, category: "toys", type: "bestsellers" },

    // Most wished for (indicates demand)
    { url: `${AMAZON_BASE}/gp/most-wished-for/electronics`, category: "electronics", type: "bestsellers" },
];

// User agents for rotation (updated for 2024-2025)
const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0",
];

// ============================================================================
// TYPES
// ============================================================================

export interface ScrapedProduct {
    asin: string;
    title: string;
    price: number;
    originalPrice?: number;
    discount: number;
    imageUrl: string;
    productUrl: string;
    rating: number;
    reviewCount: number;
    category: string;
    normalizedCategory: string;
    dealScore: number;
    source: "deals" | "bestsellers";
    scrapedAt: number;
}

interface ScrapeStats {
    requestCount: number;
    productsFound: number;
    errors: string[];
    startTime: number;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function getRandomUserAgent(): string {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function randomDelay(minMs: number, maxMs: number): Promise<void> {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1) + minMs);
    console.log(`Waiting ${Math.round(delay / 1000)}s before next request...`);
    return new Promise((resolve) => setTimeout(resolve, delay));
}

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// HTTP FETCHING WITH RETRY
// ============================================================================

async function fetchWithRetry(url: string, stats: ScrapeStats): Promise<string | null> {
    // Check request limit
    if (stats.requestCount >= CONFIG.MAX_REQUESTS_PER_SESSION) {
        console.warn(`Request limit reached (${CONFIG.MAX_REQUESTS_PER_SESSION}). Skipping: ${url}`);
        return null;
    }

    for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
        try {
            stats.requestCount++;
            console.log(`Fetching [${stats.requestCount}/${CONFIG.MAX_REQUESTS_PER_SESSION}]: ${url}`);

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);

            const response = await fetch(url, {
                headers: {
                    "User-Agent": getRandomUserAgent(),
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
                    "Accept-Encoding": "gzip, deflate, br",
                    "Connection": "keep-alive",
                    "Cache-Control": "no-cache",
                    "Pragma": "no-cache",
                    "Sec-Fetch-Dest": "document",
                    "Sec-Fetch-Mode": "navigate",
                    "Sec-Fetch-Site": "none",
                    "Sec-Fetch-User": "?1",
                    "Upgrade-Insecure-Requests": "1",
                },
                signal: controller.signal as AbortSignal,
            });

            clearTimeout(timeout);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const html = await response.text();

            // Check for CAPTCHA or bot detection
            if (html.includes("captcha") || html.includes("robot") || html.includes("automated")) {
                console.warn("Possible bot detection! Backing off...");
                stats.errors.push(`Bot detection on ${url}`);
                await sleep(CONFIG.RETRY_DELAY_MS * 2);
                return null;
            }

            return html;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`Attempt ${attempt}/${CONFIG.MAX_RETRIES} failed for ${url}: ${errorMsg}`);

            if (attempt < CONFIG.MAX_RETRIES) {
                await sleep(CONFIG.RETRY_DELAY_MS * attempt); // Exponential backoff
            } else {
                stats.errors.push(`Failed to fetch ${url}: ${errorMsg}`);
            }
        }
    }

    return null;
}

// ============================================================================
// PARSING HELPERS
// ============================================================================

function extractAsin(url: string): string | null {
    if (!url) return null;
    const patterns = [
        /\/dp\/([A-Z0-9]{10})/i,
        /\/gp\/product\/([A-Z0-9]{10})/i,
        /\/product\/([A-Z0-9]{10})/i,
        /asin=([A-Z0-9]{10})/i,
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1].toUpperCase();
    }
    return null;
}

function parsePrice(priceStr: string): number {
    if (!priceStr) return 0;
    // Handle various formats: "R$ 1.234,56", "1234.56", "R$99,90"
    const cleaned = priceStr
        .replace(/[R$\s]/g, "")
        .replace(/\.(?=\d{3})/g, "") // Remove thousand separators
        .replace(",", ".");
    const price = parseFloat(cleaned);
    return isNaN(price) ? 0 : price;
}

function parseRating(ratingStr: string): number {
    if (!ratingStr) return 0;
    // Match patterns like "4,5 de 5", "4.5 out of 5", "4,5"
    const match = ratingStr.match(/(\d)[,.](\d)/);
    if (match) {
        return parseFloat(`${match[1]}.${match[2]}`);
    }
    return 0;
}

function parseReviewCount(reviewStr: string): number {
    if (!reviewStr) return 0;
    // Remove separators and extract number
    const cleaned = reviewStr.replace(/[.\s]/g, "");
    const match = cleaned.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
}

export function normalizeCategory(amazonCategory: string): string {
    if (!amazonCategory) return "other";
    const lower = amazonCategory.toLowerCase();

    // First try exact mapping
    for (const [ourCat, amazonCats] of Object.entries(CATEGORY_MAPPING)) {
        if (amazonCats.some((cat) => lower.includes(cat.toLowerCase()))) {
            return ourCat;
        }
    }

    // Then try fuzzy aliases
    for (const [ourCat, aliases] of Object.entries(CATEGORY_ALIASES)) {
        if (aliases.some((alias) => lower.includes(alias))) {
            return ourCat;
        }
    }

    return "other";
}

// ============================================================================
// DEAL SCORE CALCULATION
// ============================================================================

export function calculateDealScore(product: Partial<ScrapedProduct>): number {
    const discount = product.discount || 0;
    const rating = product.rating || 0;
    const reviews = product.reviewCount || 0;
    const category = product.normalizedCategory || "other";

    // Discount score (0-100): 40%+ discount = max score
    const discountScore = Math.min((discount / 40) * 100, 100);

    // Rating score (0-100): 3.0 = 0, 5.0 = 100
    const ratingScore = Math.max(((rating - 3) / 2) * 100, 0);

    // Review score (0-100): log scale, 5000+ = max
    const reviewScore = Math.min((Math.log10(Math.max(reviews, 1)) / Math.log10(5000)) * 100, 100);

    // Category score (0-100)
    const categoryScore = CATEGORY_WEIGHTS[category] || CATEGORY_WEIGHTS.other;

    // Source bonus
    const sourceBonus = product.source === "deals" ? 10 : 0;

    // Weighted average
    const score =
        discountScore * 0.30 +
        ratingScore * 0.25 +
        reviewScore * 0.20 +
        categoryScore * 0.15 +
        sourceBonus;

    return Math.round(Math.min(score, 100));
}

// ============================================================================
// PAGE SCRAPERS
// ============================================================================

function scrapeProductsFromHTML(
    html: string,
    category: string,
    source: "deals" | "bestsellers"
): ScrapedProduct[] {
    const $ = cheerio.load(html);
    const products: ScrapedProduct[] = [];
    const now = Date.now();

    // Multiple selector strategies for robustness
    const selectors = [
        // Bestsellers selectors
        '[data-asin]:not([data-asin=""])',
        '.zg-item-immersion',
        '.p13n-sc-uncoverable-faceout',
        // Deals selectors
        '[data-deal-id]',
        '.DealCard-module__card',
        // Generic product cards
        '.s-result-item[data-asin]',
        '.octopus-pc-item',
    ];

    const processedAsins = new Set<string>();

    for (const selector of selectors) {
        $(selector).each((index, el) => {
            // Limit products per source
            if (products.length >= CONFIG.MAX_PRODUCTS_PER_SOURCE) return;

            try {
                const $el = $(el);

                // Extract ASIN
                let asin = $el.attr("data-asin") || "";
                if (!asin) {
                    const link = $el.find("a[href*='/dp/'], a[href*='/product/']").first().attr("href") || "";
                    asin = extractAsin(link) || "";
                }

                // Skip if no ASIN or already processed
                if (!asin || asin.length !== 10 || processedAsins.has(asin)) return;
                processedAsins.add(asin);

                // Extract title (try multiple selectors)
                const titleSelectors = [
                    ".p13n-sc-truncate",
                    "._cDEzb_p13n-sc-css-line-clamp-3_g3dy1",
                    ".a-link-normal span",
                    "[data-a-dynamic-image]",
                    "h2 a span",
                    ".a-size-base-plus",
                    "img[alt]",
                ];

                let title = "";
                for (const titleSel of titleSelectors) {
                    const text = $el.find(titleSel).first().text().trim();
                    if (text && text.length > 5) {
                        title = text;
                        break;
                    }
                }
                // Fallback to image alt
                if (!title) {
                    title = $el.find("img").first().attr("alt") || "";
                }

                if (!title || title.length < 5) return;

                // Extract price
                const priceSelectors = [
                    ".a-price .a-offscreen",
                    ".p13n-sc-price",
                    ".a-color-price",
                    "[data-a-color='price'] .a-offscreen",
                ];

                let price = 0;
                for (const priceSel of priceSelectors) {
                    const priceText = $el.find(priceSel).first().text();
                    price = parsePrice(priceText);
                    if (price > 0) break;
                }

                // Extract original price for discount calculation
                let originalPrice = 0;
                const originalPriceText = $el.find(".a-text-price .a-offscreen, .a-price[data-a-strike] .a-offscreen").first().text();
                originalPrice = parsePrice(originalPriceText);

                // Calculate discount
                let discount = 0;
                if (originalPrice > price && price > 0) {
                    discount = Math.round(((originalPrice - price) / originalPrice) * 100);
                }

                // Also try to find discount badge
                if (discount === 0) {
                    const discountText = $el.find(".a-badge-text, .savingsPercentage").first().text();
                    const discountMatch = discountText.match(/(\d+)%/);
                    if (discountMatch) {
                        discount = parseInt(discountMatch[1], 10);
                    }
                }

                // Extract image
                let imageUrl = "";
                const imgEl = $el.find("img").first();
                imageUrl = imgEl.attr("src") || imgEl.attr("data-src") || "";

                // Get higher resolution image if available
                const dynamicImage = imgEl.attr("data-a-dynamic-image");
                if (dynamicImage) {
                    try {
                        const images = JSON.parse(dynamicImage);
                        const urls = Object.keys(images);
                        if (urls.length > 0) {
                            imageUrl = urls[0];
                        }
                    } catch {
                        // Keep original imageUrl
                    }
                }

                // Extract rating
                const ratingText = $el.find(".a-icon-alt, [aria-label*='estrela']").first().text() ||
                    $el.find(".a-icon-alt, [aria-label*='star']").first().attr("aria-label") || "";
                const rating = parseRating(ratingText);

                // Extract review count
                const reviewText = $el.find(".a-size-small span[aria-label], .a-link-normal .a-size-small").last().text();
                const reviewCount = parseReviewCount(reviewText);

                // Determine category
                const productCategory = category === "general"
                    ? normalizeCategory(title)
                    : category;

                const product: ScrapedProduct = {
                    asin,
                    title: title.substring(0, 250),
                    price,
                    originalPrice: originalPrice || undefined,
                    discount,
                    imageUrl,
                    productUrl: `${AMAZON_BASE}/dp/${asin}`,
                    rating,
                    reviewCount,
                    category: productCategory,
                    normalizedCategory: normalizeCategory(productCategory),
                    dealScore: 0,
                    source,
                    scrapedAt: now,
                };

                product.dealScore = calculateDealScore(product);
                products.push(product);
            } catch (err) {
                // Silently skip malformed items
                console.debug("Error parsing product card:", err);
            }
        });

        // Stop if we have enough products
        if (products.length >= CONFIG.MAX_PRODUCTS_PER_SOURCE) break;
    }

    return products;
}

// ============================================================================
// QUALITY FILTERING
// ============================================================================

export function filterQualityProducts(products: ScrapedProduct[]): ScrapedProduct[] {
    return products.filter((p) => {
        // Basic validity checks
        if (!p.asin || p.asin.length !== 10) return false;
        if (!p.title || p.title.length < 10) return false;

        // Price range filter
        if (p.price < CONFIG.MIN_PRICE || p.price > CONFIG.MAX_PRICE) return false;

        // Quality filters (relaxed to allow more products)
        // Only apply if we have the data
        if (p.rating > 0 && p.rating < CONFIG.MIN_RATING) return false;
        if (p.reviewCount > 0 && p.reviewCount < CONFIG.MIN_REVIEWS) return false;

        return true;
    });
}

export function deduplicateProducts(products: ScrapedProduct[]): ScrapedProduct[] {
    const seen = new Map<string, ScrapedProduct>();

    for (const product of products) {
        const existing = seen.get(product.asin);
        // Keep the one with higher deal score
        if (!existing || product.dealScore > existing.dealScore) {
            seen.set(product.asin, product);
        }
    }

    return Array.from(seen.values());
}

// ============================================================================
// MAIN DISCOVERY FUNCTION
// ============================================================================

export async function discoverProducts(limit = 20): Promise<ScrapedProduct[]> {
    console.log("=".repeat(60));
    console.log("Starting product discovery...");
    console.log(`Config: max ${CONFIG.MAX_REQUESTS_PER_SESSION} requests, ${CONFIG.DELAY_MIN_MS / 1000}-${CONFIG.DELAY_MAX_MS / 1000}s delays`);
    console.log("=".repeat(60));

    const stats: ScrapeStats = {
        requestCount: 0,
        productsFound: 0,
        errors: [],
        startTime: Date.now(),
    };

    let allProducts: ScrapedProduct[] = [];

    // Scrape each source (respecting rate limits)
    for (const source of SCRAPE_SOURCES) {
        // Check if we've hit the request limit
        if (stats.requestCount >= CONFIG.MAX_REQUESTS_PER_SESSION) {
            console.log("Request limit reached. Stopping scraping.");
            break;
        }

        console.log(`\nScraping: ${source.url}`);
        const html = await fetchWithRetry(source.url, stats);

        if (html) {
            const products = scrapeProductsFromHTML(html, source.category, source.type);
            console.log(`Found ${products.length} products from ${source.category} (${source.type})`);
            allProducts = allProducts.concat(products);
            stats.productsFound += products.length;
        }

        // Add delay before next request (only if we're not done)
        if (stats.requestCount < CONFIG.MAX_REQUESTS_PER_SESSION &&
            SCRAPE_SOURCES.indexOf(source) < SCRAPE_SOURCES.length - 1) {
            await randomDelay(CONFIG.DELAY_MIN_MS, CONFIG.DELAY_MAX_MS);
        }
    }

    // Post-processing
    console.log("\n" + "=".repeat(60));
    console.log("Post-processing products...");

    const beforeDedup = allProducts.length;
    allProducts = deduplicateProducts(allProducts);
    console.log(`Deduplicated: ${beforeDedup} → ${allProducts.length}`);

    const beforeFilter = allProducts.length;
    allProducts = filterQualityProducts(allProducts);
    console.log(`Quality filtered: ${beforeFilter} → ${allProducts.length}`);

    // Sort by deal score and take top N
    allProducts.sort((a, b) => b.dealScore - a.dealScore);
    const topProducts = allProducts.slice(0, limit);

    // Summary
    const duration = (Date.now() - stats.startTime) / 1000;
    console.log("\n" + "=".repeat(60));
    console.log("SCRAPING SUMMARY");
    console.log("=".repeat(60));
    console.log(`Duration: ${duration.toFixed(1)}s`);
    console.log(`Requests made: ${stats.requestCount}/${CONFIG.MAX_REQUESTS_PER_SESSION}`);
    console.log(`Products found: ${stats.productsFound}`);
    console.log(`After processing: ${topProducts.length}`);
    if (stats.errors.length > 0) {
        console.log(`Errors: ${stats.errors.length}`);
        stats.errors.forEach((e) => console.log(`  - ${e}`));
    }
    console.log("=".repeat(60));

    return topProducts;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { CONFIG };
