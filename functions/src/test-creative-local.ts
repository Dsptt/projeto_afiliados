/**
 * Local Test Script for Canvas-based Creative Generator
 * Tests Figtree font rendering with node-canvas
 */

import { createCanvas, loadImage, registerFont } from "canvas";
import sharp from "sharp";
import * as path from "path";
import * as fs from "fs";

// ============================================================================
// CONFIGURATION
// ============================================================================

const BRAND_COLOR = "#F3D217";

const TEMPLATE = {
  WIDTH: 1080,
  HEIGHT: 1080,

  // Title bar positioning
  TITLE_TOP: 200,              // Distance from top of image to title bar
  TITLE_WIDTH: 980,
  TITLE_HEIGHT: 120,
  TITLE_OPACITY: 0.8,          // 80% opacity (0.0 to 1.0)

  // Product image positioning (rectangular)
  PRODUCT_CENTER_Y: 600,       // Vertical center of product image
  PRODUCT_WIDTH: 1080,         // Width of product area
  PRODUCT_HEIGHT: 800,         // Height of product area
  PRODUCT_FIT: "cover" as const,  // 'cover' = preenche área (pode cortar) | 'contain' = cabe sem cortar | 'fill' = estica

  // Price positioning
  PRICE_BOTTOM: 150,           // Distance from bottom of image to price
};

const ASSETS_DIR = path.join(__dirname, "..", "assets");

// Register Figtree font
console.log("📝 Registering Figtree font...");
registerFont(path.join(ASSETS_DIR, "Figtree-Bold.ttf"), { family: "Figtree", weight: "bold" });
console.log("✅ Font registered");

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatPrice(price: number): string {
  return `R$ ${price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

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

  // Draw rounded rectangle
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
// TEST DATA
// ============================================================================

const testProduct = {
  title: "Ração Whiskas Carne para Gatos Adultos Sabor Delicioso 10,1kg - Nutrição Completa",
  price: 124.64,
  originalPrice: 162.00,
};

// ============================================================================
// MAIN TEST FUNCTION
// ============================================================================

async function generateTestCreative() {
  console.log("🎨 Generating test creative with Figtree font...\n");
  console.log(`Product: ${testProduct.title}`);
  console.log(`Price: ${formatPrice(testProduct.price)}`);
  if (testProduct.originalPrice) {
    console.log(`Original: ${formatPrice(testProduct.originalPrice)}`);
  }
  console.log();

  try {
    // 1. Load base template
    const baseTemplatePath = path.join(ASSETS_DIR, "amz_1080.jpg");
    const baseTemplate = await loadImage(baseTemplatePath);
    console.log("✅ Base template loaded");

    // 2. Load product image (placeholder)
    console.log("📥 Loading product image...");
    const productImagePath = path.join(ASSETS_DIR, "test-product.png");
    const rawImage = fs.readFileSync(productImagePath);

    const productImage = await sharp(rawImage)
      .resize(TEMPLATE.PRODUCT_WIDTH, TEMPLATE.PRODUCT_HEIGHT, {
        fit: TEMPLATE.PRODUCT_FIT,  // cover = preenche área completa, contain = cabe sem cortar, fill = estica
        background: { r: 255, g: 255, b: 255, alpha: 0 },
        position: "center"  // Centraliza a imagem ao usar 'cover'
      })
      .toBuffer();
    console.log("✅ Product image processed");

    // 3. Create text overlays with Canvas + Figtree
    console.log("📝 Creating text overlays with Figtree font...");
    const titleBar = await createTitleBarCanvas(testProduct.title);

    const mainPrice = formatPrice(testProduct.price);
    const originalPrice = testProduct.originalPrice
      ? formatPrice(testProduct.originalPrice)
      : undefined;
    const priceCanvas = await createPriceCanvas(mainPrice, originalPrice);
    console.log("✅ Text overlays created with Figtree");

    // 4. Composite - Product image FIRST (behind), then title (front with opacity)
    console.log("🎨 Compositing final image...");

    // Calculate product image position (centered)
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

    // 5. Save output
    const outputPath = path.join(__dirname, "test-creative.jpg");
    fs.writeFileSync(outputPath, finalImage);

    console.log("✅ Creative generated successfully with Figtree font!");
    console.log(`📁 Saved to: ${outputPath}`);
    console.log(`📊 Size: ${(finalImage.length / 1024).toFixed(2)} KB`);

  } catch (error) {
    console.error("❌ Error generating creative:", error);
    process.exit(1);
  }
}

// Run test
generateTestCreative();
