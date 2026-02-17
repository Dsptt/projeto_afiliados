/**
 * Fetch Products Cloud Function
 * Scheduled daily to discover and store top affiliate products
 * 
 * Primary: Community scraper (Pelando/Promobit)
 * Secondary: Direct Amazon scraper (currently blocked)
 */

import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import { discoverCommunityDeals, CommunityDeal } from "./scraper/communityScraper";

const db = getFirestore();

// Partner tag for affiliate links
const PARTNER_TAG = process.env.AMAZON_PARTNER_TAG || "ihuofertas-20";

/**
 * Convert community deal to Firestore document
 */
function toFirestoreProduct(deal: CommunityDeal) {
    // Generate affiliate link with ASIN if available
    const affiliateLink = deal.asin
        ? `https://www.amazon.com.br/dp/${deal.asin}?tag=${PARTNER_TAG}`
        : deal.amazonUrl || deal.dealUrl;

    return {
        id: deal.id,
        asin: deal.asin || null,
        title: deal.title,
        price: deal.price,
        originalPrice: deal.originalPrice || null,
        discount: deal.discount,
        imageUrl: deal.imageUrl,
        affiliateLink,
        dealUrl: deal.dealUrl,
        amazonUrl: deal.amazonUrl || null,
        category: deal.normalizedCategory,
        originalCategory: deal.category,
        upvotes: deal.upvotes,
        dealScore: deal.dealScore,
        source: deal.source,
        fetchedAt: admin.firestore.FieldValue.serverTimestamp(),
        posted: false,
        clicks: 0,
    };
}

/**
 * Scheduled function: Fetch products daily at 6AM BRT (9AM UTC)
 */
export const fetchProductsScheduled = onSchedule(
    {
        schedule: "0 9 * * *", // 9AM UTC = 6AM BRT
        timeZone: "America/Sao_Paulo",
        memory: "512MiB",
        timeoutSeconds: 300, // 5 minutes (community scraping is faster)
    },
    async () => {
        console.log("Starting scheduled product fetch (community sources)...");

        try {
            // Discover deals from community sources
            const deals = await discoverCommunityDeals(20);

            if (deals.length === 0) {
                console.warn("No deals discovered from community sources!");
                return;
            }

            console.log(`Discovered ${deals.length} deals. Saving to Firestore...`);

            // Batch write to Firestore
            const batch = db.batch();
            let newCount = 0;
            let updateCount = 0;

            for (const deal of deals) {
                const docId = deal.asin || deal.id;
                const docRef = db.collection("products").doc(docId);
                const existing = await docRef.get();

                if (existing.exists) {
                    // Update only price-related fields
                    batch.update(docRef, {
                        price: deal.price,
                        originalPrice: deal.originalPrice || null,
                        discount: deal.discount,
                        upvotes: deal.upvotes,
                        dealScore: deal.dealScore,
                        fetchedAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                    updateCount++;
                } else {
                    // Create new product
                    batch.set(docRef, toFirestoreProduct(deal));
                    newCount++;
                }
            }

            await batch.commit();
            console.log(`Fetch complete: ${newCount} new, ${updateCount} updated`);

            // Log metrics
            await db.collection("metrics").add({
                name: "product_fetch",
                source: "community",
                dealsDiscovered: deals.length,
                newProducts: newCount,
                updatedProducts: updateCount,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
            });
        } catch (error) {
            console.error("Error in scheduled product fetch:", error);
            throw error;
        }
    }
);

/**
 * HTTP trigger for manual product fetch (for testing)
 */
export const fetchProductsManual = onRequest(
    {
        memory: "512MiB",
        timeoutSeconds: 300,
        cors: true,
    },
    async (req, res) => {
        // Allow POST for API calls and GET for browser testing
        if (req.method !== "POST" && req.method !== "GET") {
            res.status(405).json({ error: "Method not allowed. Use POST or GET." });
            return;
        }

        console.log("Starting manual product fetch (community sources)...");

        try {
            const limitParam = req.query.limit?.toString();
            const limit = limitParam ? parseInt(limitParam, 10) : 20;
            const saveToFirestore = req.query.save !== "false";

            const deals = await discoverCommunityDeals(Math.min(limit, 50));

            let newCount = 0;

            if (saveToFirestore && deals.length > 0) {
                // Batch write to Firestore
                const batch = db.batch();

                for (const deal of deals) {
                    const docId = deal.asin || deal.id;
                    const docRef = db.collection("products").doc(docId);
                    const existing = await docRef.get();

                    if (!existing.exists) {
                        batch.set(docRef, toFirestoreProduct(deal));
                        newCount++;
                    }
                }

                await batch.commit();
            }

            res.json({
                success: true,
                source: "community",
                dealsDiscovered: deals.length,
                newProducts: newCount,
                savedToFirestore: saveToFirestore,
                deals: deals.slice(0, 10).map((d) => ({
                    id: d.id,
                    asin: d.asin,
                    title: d.title.substring(0, 60) + (d.title.length > 60 ? "..." : ""),
                    price: d.price,
                    discount: d.discount,
                    upvotes: d.upvotes,
                    dealScore: d.dealScore,
                    source: d.source,
                })),
            });
        } catch (error) {
            console.error("Error in manual product fetch:", error);
            res.status(500).json({ error: "Failed to fetch products" });
        }
    }
);
