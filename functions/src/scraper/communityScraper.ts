/**
 * Community Deal Scraper - Pelando & Promobit
 * 
 * Scrapes deal aggregator sites that already filter Amazon deals.
 * These sites don't block server requests like Amazon does.
 * 
 * SAFETY FEATURES:
 * - Rate limiting with configurable delays
 * - Request limits per session
 * - Retry with exponential backoff
 * - Focus only on Amazon deals
 */

import * as cheerio from "cheerio";
import fetch from "node-fetch";

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    // Maximum requests per scraping session
    MAX_REQUESTS: 4,

    // Delay between requests (ms)
    DELAY_MIN_MS: 3000,
    DELAY_MAX_MS: 6000,

    // Retry configuration
    MAX_RETRIES: 2,
    RETRY_DELAY_MS: 2000,

    // Request timeout
    TIMEOUT_MS: 20000,

    // Maximum products per source
    MAX_PRODUCTS_PER_SOURCE: 30,

    // Quality thresholds
    MIN_UPVOTES: 5,  // Minimum community upvotes
    MIN_DISCOUNT: 10, // Minimum discount percentage
};

// ============================================================================
// SOURCES
// ============================================================================

const COMMUNITY_SOURCES = [
    {
        name: "Pelando",
        url: "https://www.pelando.com.br/search?q=amazon",
        selectors: {
            dealCard: '[data-t="dealCard"], .sc-b0f6b0c2-0, .dealCard',
            title: '[data-t="dealTitle"], .thread-title, .dealTitle',
            price: '[data-t="dealPrice"], .dealPrice, .thread-price',
            originalPrice: '[data-t="originalPrice"], .originalPrice, .thread-price-old',
            discount: '[data-t="discount"], .discount-badge, .dealDiscount',
            link: 'a[href*="amazon"]',
            image: 'img[src*="amazon"], img[data-src*="amazon"]',
            upvotes: '[data-t="voteCount"], .vote-count, .dealVotes',
            category: '[data-t="category"], .category-tag, .threadCategory',
        },
    },
    {
        name: "Promobit",
        url: "https://www.promobit.com.br/promocoes/loja/amazon",
        selectors: {
            dealCard: '.offer-card, .promotion-card, [data-offer-id]',
            title: '.offer-title, .promotion-title, h2 a',
            price: '.offer-price, .price-current, .promotion-price',
            originalPrice: '.offer-price-old, .price-old',
            discount: '.offer-discount, .discount-tag',
            link: 'a[href*="amazon"]',
            image: 'img.offer-image, img.promotion-image',
            upvotes: '.offer-votes, .vote-count',
            category: '.offer-category, .category-name',
        },
    },
];

// Category mapping
const CATEGORY_KEYWORDS: Record<string, string[]> = {
    electronics: ["eletrônico", "celular", "smartphone", "notebook", "tablet", "fone", "tv", "monitor", "ssd", "hd", "mouse", "teclado", "webcam", "câmera", "console", "playstation", "xbox", "switch", "gamer"],
    home: ["casa", "cozinha", "eletrodoméstico", "aspirador", "cafeteira", "liquidificador", "airfryer", "panela", "fogão", "geladeira", "micro-ondas", "ventilador", "ar condicionado"],
    sports: ["esporte", "academia", "fitness", "bike", "bicicleta", "tênis", "corrida", "whey", "suplemento", "haltere", "esteira"],
    toys: ["brinquedo", "lego", "boneca", "carrinho", "jogo", "nerf", "barbie", "hot wheels"],
};

const CATEGORY_WEIGHTS: Record<string, number> = {
    electronics: 100,
    home: 80,
    sports: 75,
    toys: 70,
    other: 50,
};

// User agents
const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
];

// ============================================================================
// TYPES
// ============================================================================

export interface CommunityDeal {
    id: string;
    title: string;
    price: number;
    originalPrice?: number;
    discount: number;
    dealUrl: string;
    amazonUrl?: string;
    asin?: string;
    imageUrl: string;
    upvotes: number;
    category: string;
    normalizedCategory: string;
    source: string;
    dealScore: number;
    scrapedAt: number;
}

interface ScrapeStats {
    requestCount: number;
    dealsFound: number;
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
// HTTP FETCHING
// ============================================================================

async function fetchWithRetry(url: string, stats: ScrapeStats): Promise<string | null> {
    if (stats.requestCount >= CONFIG.MAX_REQUESTS) {
        console.warn(`Request limit reached (${CONFIG.MAX_REQUESTS}). Skipping: ${url}`);
        return null;
    }

    for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
        try {
            stats.requestCount++;
            console.log(`Fetching [${stats.requestCount}/${CONFIG.MAX_REQUESTS}]: ${url}`);

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);

            const response = await fetch(url, {
                headers: {
                    "User-Agent": getRandomUserAgent(),
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
                    "Accept-Encoding": "gzip, deflate, br",
                    "Connection": "keep-alive",
                },
                signal: controller.signal as AbortSignal,
            });

            clearTimeout(timeout);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.text();
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`Attempt ${attempt}/${CONFIG.MAX_RETRIES} failed: ${errorMsg}`);

            if (attempt < CONFIG.MAX_RETRIES) {
                await sleep(CONFIG.RETRY_DELAY_MS * attempt);
            } else {
                stats.errors.push(`Failed to fetch ${url}: ${errorMsg}`);
            }
        }
    }

    return null;
}

// ============================================================================
// PARSING FUNCTIONS
// ============================================================================

function extractAsin(url: string): string | null {
    if (!url) return null;
    const patterns = [
        /amazon\.com\.br\/dp\/([A-Z0-9]{10})/i,
        /amazon\.com\.br\/gp\/product\/([A-Z0-9]{10})/i,
        /amzn\.to\/([A-Za-z0-9]+)/i, // Shortened links
        /tag=([^&]+)/i, // May contain ASIN in some formats
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1].length === 10) return match[1].toUpperCase();
    }
    return null;
}

function parsePrice(priceStr: string): number {
    if (!priceStr) return 0;
    const cleaned = priceStr
        .replace(/[R$\s]/g, "")
        .replace(/\.(?=\d{3})/g, "")
        .replace(",", ".");
    const price = parseFloat(cleaned);
    return isNaN(price) ? 0 : price;
}

function parseDiscount(discountStr: string): number {
    if (!discountStr) return 0;
    const match = discountStr.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
}

function parseUpvotes(voteStr: string): number {
    if (!voteStr) return 0;
    const cleaned = voteStr.replace(/[^\d-]/g, "");
    return parseInt(cleaned, 10) || 0;
}

function normalizeCategory(text: string): string {
    const lower = text.toLowerCase();

    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        if (keywords.some((kw) => lower.includes(kw))) {
            return category;
        }
    }

    return "other";
}

function generateDealId(source: string, title: string, price: number): string {
    const hash = title.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 20);
    return `${source.toLowerCase()}-${hash}-${Math.round(price)}`;
}

// ============================================================================
// DEAL SCORE CALCULATION
// ============================================================================

function calculateDealScore(deal: Partial<CommunityDeal>): number {
    const discount = deal.discount || 0;
    const upvotes = deal.upvotes || 0;
    const category = deal.normalizedCategory || "other";

    // Discount score (0-100): 40%+ = max
    const discountScore = Math.min((discount / 40) * 100, 100);

    // Upvote score (0-100): log scale, 100+ votes = max
    const upvoteScore = Math.min((Math.log10(Math.max(upvotes, 1) + 1) / 2) * 100, 100);

    // Category score (0-100)
    const categoryScore = CATEGORY_WEIGHTS[category] || CATEGORY_WEIGHTS.other;

    // Has ASIN bonus (can track clicks properly)
    const asinBonus = deal.asin ? 15 : 0;

    // Weighted average
    const score =
        discountScore * 0.35 +
        upvoteScore * 0.30 +
        categoryScore * 0.20 +
        asinBonus;

    return Math.round(Math.min(score, 100));
}

// ============================================================================
// SOURCE SCRAPERS
// ============================================================================

function scrapeDealsFromHTML(
    html: string,
    source: typeof COMMUNITY_SOURCES[0]
): CommunityDeal[] {
    const $ = cheerio.load(html);
    const deals: CommunityDeal[] = [];
    const now = Date.now();
    const processedTitles = new Set<string>();

    console.log(`Parsing HTML from ${source.name}...`);

    // Try each deal card selector
    const cardSelectors = source.selectors.dealCard.split(", ");

    for (const cardSelector of cardSelectors) {
        $(cardSelector).each((index, el) => {
            if (deals.length >= CONFIG.MAX_PRODUCTS_PER_SOURCE) return;

            try {
                const $el = $(el);

                // Extract title
                let title = "";
                for (const sel of source.selectors.title.split(", ")) {
                    title = $el.find(sel).first().text().trim();
                    if (title) break;
                }

                if (!title || title.length < 10) return;

                // Skip duplicates
                const titleKey = title.toLowerCase().substring(0, 50);
                if (processedTitles.has(titleKey)) return;
                processedTitles.add(titleKey);

                // Must be Amazon deal
                let amazonUrl = "";
                for (const sel of source.selectors.link.split(", ")) {
                    const href = $el.find(sel).first().attr("href") || "";
                    if (href.includes("amazon")) {
                        amazonUrl = href;
                        break;
                    }
                }

                // Also check in title link
                if (!amazonUrl) {
                    const allLinks = $el.find("a").toArray();
                    for (const link of allLinks) {
                        const href = $(link).attr("href") || "";
                        if (href.includes("amazon") || href.includes("amzn")) {
                            amazonUrl = href;
                            break;
                        }
                    }
                }

                if (!amazonUrl) return; // Skip non-Amazon deals

                // Extract ASIN from Amazon URL
                const asin = extractAsin(amazonUrl);

                // Extract price
                let price = 0;
                for (const sel of source.selectors.price.split(", ")) {
                    price = parsePrice($el.find(sel).first().text());
                    if (price > 0) break;
                }

                // Extract original price
                let originalPrice = 0;
                for (const sel of source.selectors.originalPrice.split(", ")) {
                    originalPrice = parsePrice($el.find(sel).first().text());
                    if (originalPrice > 0) break;
                }

                // Extract or calculate discount
                let discount = 0;
                for (const sel of source.selectors.discount.split(", ")) {
                    discount = parseDiscount($el.find(sel).first().text());
                    if (discount > 0) break;
                }

                if (discount === 0 && originalPrice > price && price > 0) {
                    discount = Math.round(((originalPrice - price) / originalPrice) * 100);
                }

                // Extract upvotes
                let upvotes = 0;
                for (const sel of source.selectors.upvotes.split(", ")) {
                    upvotes = parseUpvotes($el.find(sel).first().text());
                    if (upvotes !== 0) break;
                }

                // Extract image
                let imageUrl = "";
                for (const sel of source.selectors.image.split(", ")) {
                    const img = $el.find(sel).first();
                    imageUrl = img.attr("src") || img.attr("data-src") || "";
                    if (imageUrl) break;
                }

                // Fallback to any image
                if (!imageUrl) {
                    const anyImg = $el.find("img").first();
                    imageUrl = anyImg.attr("src") || anyImg.attr("data-src") || "";
                }

                // Extract category
                let category = "";
                for (const sel of source.selectors.category.split(", ")) {
                    category = $el.find(sel).first().text().trim();
                    if (category) break;
                }

                // Get deal page URL
                const dealUrl = $el.find("a").first().attr("href") || "";

                const deal: CommunityDeal = {
                    id: asin || generateDealId(source.name, title, price),
                    title: title.substring(0, 250),
                    price,
                    originalPrice: originalPrice || undefined,
                    discount,
                    dealUrl: dealUrl.startsWith("http") ? dealUrl : `https://${source.name.toLowerCase()}.com.br${dealUrl}`,
                    amazonUrl,
                    asin: asin || undefined,
                    imageUrl,
                    upvotes,
                    category: category || "Geral",
                    normalizedCategory: normalizeCategory(title + " " + category),
                    source: source.name,
                    dealScore: 0,
                    scrapedAt: now,
                };

                deal.dealScore = calculateDealScore(deal);
                deals.push(deal);
            } catch (err) {
                // Silently skip malformed items
                console.debug("Error parsing deal card:", err);
            }
        });

        if (deals.length > 0) break; // Found deals with this selector
    }

    console.log(`Found ${deals.length} Amazon deals from ${source.name}`);
    return deals;
}

// ============================================================================
// QUALITY FILTERING
// ============================================================================

function filterQualityDeals(deals: CommunityDeal[]): CommunityDeal[] {
    return deals.filter((d) => {
        // Must have basic info
        if (!d.title || d.title.length < 10) return false;

        // Price should be reasonable
        if (d.price > 0 && (d.price < 20 || d.price > 3000)) return false;

        // Community validation (upvotes)
        if (d.upvotes < CONFIG.MIN_UPVOTES) return false;

        // Minimum discount
        if (d.discount < CONFIG.MIN_DISCOUNT) return false;

        return true;
    });
}

function deduplicateDeals(deals: CommunityDeal[]): CommunityDeal[] {
    const seen = new Map<string, CommunityDeal>();

    for (const deal of deals) {
        // Prefer deals with ASIN for deduplication
        const key = deal.asin || deal.id;
        const existing = seen.get(key);

        if (!existing || deal.dealScore > existing.dealScore) {
            seen.set(key, deal);
        }
    }

    return Array.from(seen.values());
}

// ============================================================================
// MAIN DISCOVERY FUNCTION
// ============================================================================

export async function discoverCommunityDeals(limit = 20): Promise<CommunityDeal[]> {
    console.log("=".repeat(60));
    console.log("Starting community deal discovery...");
    console.log(`Sources: ${COMMUNITY_SOURCES.map((s) => s.name).join(", ")}`);
    console.log("=".repeat(60));

    const stats: ScrapeStats = {
        requestCount: 0,
        dealsFound: 0,
        errors: [],
        startTime: Date.now(),
    };

    let allDeals: CommunityDeal[] = [];

    // Scrape each source
    for (const source of COMMUNITY_SOURCES) {
        if (stats.requestCount >= CONFIG.MAX_REQUESTS) {
            console.log("Request limit reached. Stopping.");
            break;
        }

        console.log(`\nScraping ${source.name}...`);
        const html = await fetchWithRetry(source.url, stats);

        if (html) {
            const deals = scrapeDealsFromHTML(html, source);
            allDeals = allDeals.concat(deals);
            stats.dealsFound += deals.length;
        }

        // Delay between sources
        if (stats.requestCount < CONFIG.MAX_REQUESTS) {
            await randomDelay(CONFIG.DELAY_MIN_MS, CONFIG.DELAY_MAX_MS);
        }
    }

    // Post-processing
    console.log("\n" + "=".repeat(60));
    console.log("Post-processing deals...");

    const beforeDedup = allDeals.length;
    allDeals = deduplicateDeals(allDeals);
    console.log(`Deduplicated: ${beforeDedup} → ${allDeals.length}`);

    const beforeFilter = allDeals.length;
    allDeals = filterQualityDeals(allDeals);
    console.log(`Quality filtered: ${beforeFilter} → ${allDeals.length}`);

    // Sort by deal score and take top N
    allDeals.sort((a, b) => b.dealScore - a.dealScore);
    const topDeals = allDeals.slice(0, limit);

    // Summary
    const duration = (Date.now() - stats.startTime) / 1000;
    console.log("\n" + "=".repeat(60));
    console.log("SCRAPING SUMMARY");
    console.log("=".repeat(60));
    console.log(`Duration: ${duration.toFixed(1)}s`);
    console.log(`Requests made: ${stats.requestCount}/${CONFIG.MAX_REQUESTS}`);
    console.log(`Deals found: ${stats.dealsFound}`);
    console.log(`After processing: ${topDeals.length}`);
    if (stats.errors.length > 0) {
        console.log(`Errors: ${stats.errors.length}`);
        stats.errors.forEach((e) => console.log(`  - ${e}`));
    }
    console.log("=".repeat(60));

    return topDeals;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { CONFIG };
