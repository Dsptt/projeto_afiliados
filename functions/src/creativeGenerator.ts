/**
 * Creative Generator - Canvas-based implementation with Figtree font support
 * 
 * Uses node-canvas for text rendering with custom fonts
 * and Sharp for final image composition
 */

import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { createCanvas, loadImage, registerFont } from "canvas";
import sharp from "sharp";
import fetch from "node-fetch";
import * as path from "path";

// ============================================================================
// CONFIGURATION
// ============================================================================

const BRAND_COLOR = "#F3D217"; // Yellow

const TEMPLATE = {
    WIDTH: 1080,
    HEIGHT: 1080,

    // Title bar positioning
    TITLE_TOP: 200,              // Distance from top of image to title bar
    TITLE_WIDTH: 980,
    TITLE_HEIGHT: 120,
    TITLE_OPACITY: 0.8,          // 80% opacity (0.0 to 1.0)

    // Product image positioning (rectangular)
    PRODUCT_CENTER_Y: 550,       // Vertical center of product image
    PRODUCT_WIDTH: 800,          // Width of product area
    PRODUCT_HEIGHT: 600,         // Height of product area
    PRODUCT_FIT: "cover" as const,  // 'cover' = preenche área (pode cortar) | 'contain' = cabe sem cortar | 'fill' = estica

    // Price positioning
    PRICE_BOTTOM: 150,           // Distance from bottom of image to price
};

const ASSETS_DIR = path.join(__dirname, "..", "assets");
const STORAGE_BUCKET = "ihuprojectmanager.firebasestorage.app";

// Register Figtree fonts
registerFont(path.join(ASSETS_DIR, "Figtree-Bold.ttf"), { family: "Figtree", weight: "bold" });
registerFont(path.join(ASSETS_DIR, "Figtree-SemiBold.ttf"), { family: "Figtree", weight: "600" });

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function downloadImage(url: string): Promise<Buffer> {
    const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ImageBot/1.0)" },
    });
    if (!response.ok) throw new Error(`Failed to download image: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
}

function formatPrice(price: number): string {
    return `R$ ${price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Wraps text into multiple lines based on character limit
 */
function wrapText(text: string, maxCharsPerLine: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (testLine.length <= maxCharsPerLine) {
            currentLine = testLine;
        } else {
            if (currentLine) lines.push(currentLine);
            currentLine = word;
        }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
}

/**
 * Creates title bar canvas with Figtree font
 */
async function createTitleBarCanvas(text: string): Promise<Buffer> {
    const maxCharsPerLine = 45;
    const lines = wrapText(text, maxCharsPerLine).slice(0, 2);

    if (lines.length === 2 && lines[1].length > maxCharsPerLine) {
        lines[1] = lines[1].substring(0, maxCharsPerLine - 3) + '...';
    } else if (lines.length === 1 && lines[0].length > maxCharsPerLine) {
        lines[0] = lines[0].substring(0, maxCharsPerLine - 3) + '...';
    }

    const canvas = createCanvas(TEMPLATE.WIDTH, TEMPLATE.TITLE_HEIGHT + 20);
    const ctx = canvas.getContext('2d');

    // Draw rounded rectangle with opacity
    const rectX = (TEMPLATE.WIDTH - TEMPLATE.TITLE_WIDTH) / 2;
    const rectY = 10;
    const radius = 20;

    ctx.globalAlpha = TEMPLATE.TITLE_OPACITY;  // Apply 80% opacity
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.moveTo(rectX + radius, rectY);
    ctx.lineTo(rectX + TEMPLATE.TITLE_WIDTH - radius, rectY);
    ctx.quadraticCurveTo(rectX + TEMPLATE.TITLE_WIDTH, rectY, rectX + TEMPLATE.TITLE_WIDTH, rectY + radius);
    ctx.lineTo(rectX + TEMPLATE.TITLE_WIDTH, rectY + TEMPLATE.TITLE_HEIGHT - radius);
    ctx.quadraticCurveTo(rectX + TEMPLATE.TITLE_WIDTH, rectY + TEMPLATE.TITLE_HEIGHT, rectX + TEMPLATE.TITLE_WIDTH - radius, rectY + TEMPLATE.TITLE_HEIGHT);
    ctx.lineTo(rectX + radius, rectY + TEMPLATE.TITLE_HEIGHT);
    ctx.quadraticCurveTo(rectX, rectY + TEMPLATE.TITLE_HEIGHT, rectX, rectY + TEMPLATE.TITLE_HEIGHT - radius);
    ctx.lineTo(rectX, rectY + radius);
    ctx.quadraticCurveTo(rectX, rectY, rectX + radius, rectY);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1.0;  // Reset opacity for text

    // Text positioning constants (easier to adjust)
    const TITLE_FONT_SIZE_TWO_LINES = 44;
    const TITLE_FONT_SIZE_ONE_LINE = 54;
    const TITLE_LINE_HEIGHT_MULTIPLIER = 1.2;
    const TITLE_START_Y_TWO_LINES = 35;  // Distance from top of title bar to first line
    const TITLE_START_Y_ONE_LINE = 50;   // Distance from top of title bar (centered)

    const fontSize = lines.length === 2 ? TITLE_FONT_SIZE_TWO_LINES : TITLE_FONT_SIZE_ONE_LINE;
    const lineHeight = fontSize * TITLE_LINE_HEIGHT_MULTIPLIER;
    const startY = lines.length === 2 ? TITLE_START_Y_TWO_LINES : TITLE_START_Y_ONE_LINE;

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${fontSize}px Figtree, Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    lines.forEach((line, index) => {
        ctx.fillText(line, TEMPLATE.WIDTH / 2, startY + (index * lineHeight));
    });

    return canvas.toBuffer('image/png');
}

/**
 * Creates price canvas with Figtree font and stroke
 */
async function createPriceCanvas(text: string, originalPrice?: string): Promise<Buffer> {
    const svgHeight = originalPrice ? 220 : 180;
    const canvas = createCanvas(TEMPLATE.WIDTH, svgHeight);
    const ctx = canvas.getContext('2d');

    // Price positioning constants (easier to adjust)
    const MAIN_PRICE_Y = -12;              // Fixed Y position for main price (never changes)
    const MAIN_PRICE_FONT_SIZE = 140;
    const MAIN_PRICE_OUTLINE_WIDTH = 8;

    const ORIGINAL_PRICE_FONT_SIZE = 50;
    const ORIGINAL_PRICE_SPACING = -80;    // Distance above main price (negative = above)
    const STRIKETHROUGH_Y_OFFSET = 30;     // Distance from original price text to strikethrough line
    const STRIKETHROUGH_LINE_WIDTH = 4;

    // Draw original price (strikethrough) if exists - positioned ABOVE main price
    if (originalPrice) {
        const originalPriceY = MAIN_PRICE_Y + ORIGINAL_PRICE_SPACING;

        ctx.fillStyle = '#666666';
        ctx.font = `bold ${ORIGINAL_PRICE_FONT_SIZE}px Figtree, Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(originalPrice, TEMPLATE.WIDTH / 2, originalPriceY);

        // Strikethrough line
        const metrics = ctx.measureText(originalPrice);
        const textWidth = metrics.width;
        const lineY = originalPriceY + STRIKETHROUGH_Y_OFFSET;
        ctx.strokeStyle = '#666666';
        ctx.lineWidth = STRIKETHROUGH_LINE_WIDTH;
        ctx.beginPath();
        ctx.moveTo((TEMPLATE.WIDTH - textWidth) / 2, lineY);
        ctx.lineTo((TEMPLATE.WIDTH + textWidth) / 2, lineY);
        ctx.stroke();
    }

    // Draw main price with stroke (outline) - ALWAYS at fixed Y position
    ctx.font = `900 ${MAIN_PRICE_FONT_SIZE}px Figtree, Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // Stroke (outline)
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = MAIN_PRICE_OUTLINE_WIDTH;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, TEMPLATE.WIDTH / 2, MAIN_PRICE_Y);

    // Fill
    ctx.fillStyle = BRAND_COLOR;
    ctx.fillText(text, TEMPLATE.WIDTH / 2, MAIN_PRICE_Y);

    return canvas.toBuffer('image/png');
}

// ============================================================================
// MAIN GENERATOR
// ============================================================================

interface ProductData {
    asin: string;
    title: string;
    price: number;
    originalPrice?: number | null;
    discount: number;
    imageUrl: string;
}

/**
 * Generates promotional image using Canvas + Sharp
 */
export async function generateCreativeImage(product: ProductData): Promise<Buffer> {
    console.log(`Generating creative for: ${product.title.substring(0, 50)}...`);

    // 1. Load base template
    const baseTemplatePath = path.join(ASSETS_DIR, "amz_1080.jpg");
    const baseTemplate = await loadImage(baseTemplatePath);

    // 2. Download and process product image
    let productImage: Buffer;
    try {
        const rawImage = await downloadImage(product.imageUrl);
        productImage = await sharp(rawImage)
            .resize(TEMPLATE.PRODUCT_WIDTH, TEMPLATE.PRODUCT_HEIGHT, {
                fit: "contain",
                background: { r: 255, g: 255, b: 255, alpha: 0 }
            })
            .toBuffer();
    } catch (error) {
        console.error("Failed to download product image, using placeholder");
        productImage = await sharp({
            create: {
                width: TEMPLATE.PRODUCT_WIDTH,
                height: TEMPLATE.PRODUCT_HEIGHT,
                channels: 4,
                background: { r: 220, g: 220, b: 220, alpha: 1 }
            },
        }).png().toBuffer();
    }

    // 3. Create text overlays using Canvas
    const titleBar = await createTitleBarCanvas(product.title);

    const mainPrice = formatPrice(product.price);
    const originalPrice = product.originalPrice && product.originalPrice > product.price
        ? formatPrice(product.originalPrice)
        : undefined;
    const priceCanvas = await createPriceCanvas(mainPrice, originalPrice);

    // 4. Composite all layers - Product image FIRST (behind), then title (front with opacity)
    const productTop = TEMPLATE.PRODUCT_CENTER_Y - (TEMPLATE.PRODUCT_HEIGHT / 2);
    const productLeft = (TEMPLATE.WIDTH - TEMPLATE.PRODUCT_WIDTH) / 2;

    const composites: sharp.OverlayOptions[] = [
        // Layer 1: Product image (behind everything)
        {
            input: productImage,
            top: productTop,
            left: productLeft
        },
        // Layer 2: Title bar (front, with 80% opacity)
        { input: titleBar, top: TEMPLATE.TITLE_TOP, left: 0 },
        // Layer 3: Price (front)
        {
            input: priceCanvas,
            top: TEMPLATE.HEIGHT - TEMPLATE.PRICE_BOTTOM,
            left: 0
        },
    ];

    const finalImage = await sharp(baseTemplate.src as Buffer)
        .composite(composites)
        .jpeg({ quality: 95 })
        .toBuffer();

    console.log(`Creative generated: ${finalImage.length} bytes`);
    return finalImage;
}

// ============================================================================
// CLOUD FUNCTIONS
// ============================================================================

const db = admin.firestore();

export const generateCreative = functions.https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    if (req.method === "OPTIONS") {
        res.set("Access-Control-Allow-Methods", "POST");
        res.set("Access-Control-Allow-Headers", "Content-Type");
        res.status(204).send("");
        return;
    }

    if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
    }

    try {
        const { asin } = req.body;
        if (!asin) {
            res.status(400).json({ error: "Missing ASIN" });
            return;
        }

        const productDoc = await db.collection("products").doc(asin).get();
        if (!productDoc.exists) {
            res.status(404).json({ error: "Product not found" });
            return;
        }

        const product = productDoc.data() as ProductData;
        product.asin = asin;

        const imageBuffer = await generateCreativeImage(product);

        const bucket = admin.storage().bucket(STORAGE_BUCKET);
        const filename = `creatives/${asin}.jpg`;
        const file = bucket.file(filename);

        await file.save(imageBuffer, {
            metadata: {
                contentType: "image/jpeg",
                metadata: { asin, generatedAt: new Date().toISOString() },
            },
        });

        await file.makePublic();
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;

        await db.collection("products").doc(asin).update({
            creativeUrl: publicUrl,
            creativeGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        res.json({ success: true, asin, creativeUrl: publicUrl });
    } catch (error) {
        console.error("Error generating creative:", error);
        res.status(500).json({ error: "Failed to generate creative" });
    }
});

export const generateAllCreatives = functions.https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");

    try {
        const snapshot = await db.collection("products")
            .where("creativeUrl", "==", null)
            .limit(10)
            .get();

        if (snapshot.empty) {
            res.json({ message: "No products need creatives", count: 0 });
            return;
        }

        const results: { asin: string; status: string }[] = [];

        for (const doc of snapshot.docs) {
            const product = doc.data() as ProductData;
            product.asin = doc.id;

            try {
                const imageBuffer = await generateCreativeImage(product);
                const bucket = admin.storage().bucket(STORAGE_BUCKET);
                const filename = `creatives/${doc.id}.jpg`;
                const file = bucket.file(filename);

                await file.save(imageBuffer, { metadata: { contentType: "image/jpeg" } });
                await file.makePublic();

                const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;
                await doc.ref.update({
                    creativeUrl: publicUrl,
                    creativeGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
                });

                results.push({ asin: doc.id, status: "success" });
            } catch (err) {
                console.error(`Failed for ${doc.id}:`, err);
                results.push({ asin: doc.id, status: "failed" });
            }
        }

        res.json({ message: "Batch generation complete", count: results.length, results });
    } catch (error) {
        console.error("Error in batch generation:", error);
        res.status(500).json({ error: "Batch generation failed" });
    }
});
