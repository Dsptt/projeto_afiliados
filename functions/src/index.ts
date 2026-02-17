import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import * as crypto from "crypto";

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

// Re-export product fetching functions
export { fetchProductsScheduled, fetchProductsManual } from "./fetchProducts";

// Re-export creative generation functions
export { generateCreative, generateAllCreatives } from "./creativeGenerator";

interface TrackClickBody {
    productId: string;
    timestamp: number;
    userAgent: string;
}

/**
 * Track a click on an affiliate link.
 * Called from the redirect page before redirecting to Amazon.
 */
export const trackClick = onRequest({ cors: true }, async (req, res) => {
    // Only allow POST
    if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
    }

    try {
        const body: TrackClickBody = req.body;
        const { productId, timestamp, userAgent } = body;

        if (!productId) {
            res.status(400).json({ error: "productId is required" });
            return;
        }

        // Get UTM source from query params for group tracking
        const groupId = req.query.utm_source?.toString() || "direct";

        // Hash IP for privacy (never store raw IP)
        const clientIp = req.headers["x-forwarded-for"]?.toString().split(",")[0] ||
            req.ip ||
            "unknown";
        const ipHash = crypto.createHash("sha256").update(clientIp).digest("hex");

        // Get country from Cloudflare or default to BR
        const country = req.headers["cf-ipcountry"]?.toString() || "BR";

        // Get the product to return the affiliate link
        const productDoc = await db.collection("products").doc(productId).get();

        if (!productDoc.exists) {
            res.status(404).json({ error: "Product not found" });
            return;
        }

        const product = productDoc.data();

        // Record the click
        await db.collection("clicks").add({
            productId,
            timestamp: admin.firestore.Timestamp.fromMillis(timestamp || Date.now()),
            groupId,
            ipHash,
            country,
            userAgent: userAgent || req.headers["user-agent"] || "unknown",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Return the affiliate link for redirect
        res.json({
            success: true,
            affiliateLink: product?.affiliateLink || null,
        });
    } catch (error) {
        console.error("Error tracking click:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * Get product info for redirect page.
 * Returns product title and affiliate link.
 */
export const getProduct = onRequest({ cors: true }, async (req, res) => {
    const productId = req.query.id?.toString();

    if (!productId) {
        res.status(400).json({ error: "id query parameter is required" });
        return;
    }

    try {
        const productDoc = await db.collection("products").doc(productId).get();

        if (!productDoc.exists) {
            res.status(404).json({ error: "Product not found" });
            return;
        }

        const product = productDoc.data();

        res.json({
            id: productDoc.id,
            title: product?.title || "Oferta Especial",
            affiliateLink: product?.affiliateLink,
            imageUrl: product?.imageUrl,
        });
    } catch (error) {
        console.error("Error getting product:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
