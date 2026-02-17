// Test script to add a sample product to Firestore
// Run with: node scripts/add-test-product.js

const admin = require("firebase-admin");

// Initialize with default credentials (uses GOOGLE_APPLICATION_CREDENTIALS)
admin.initializeApp({
    projectId: "ihuprojectmanager"
});

const db = admin.firestore();

async function addTestProduct() {
    const testProduct = {
        asin: "TEST123",
        title: "Fone Bluetooth JBL Tune 510BT - Teste",
        price: 199.90,
        imageUrl: "https://m.media-amazon.com/images/I/61Kl2EhZYiL._AC_SL1500_.jpg",
        affiliateLink: "https://www.amazon.com.br/dp/B08WJNTZ9C?tag=ihuofertas-20",
        category: "electronics",
        fetchedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    try {
        const docRef = await db.collection("products").doc("test-product-001").set(testProduct);
        console.log("✅ Test product added with ID: test-product-001");
        console.log("\n📋 Test URL:");
        console.log("https://ihuprojectmanager.web.app/r/?id=test-product-001&utm_source=whatsapp");
        console.log("\nThis will redirect to:", testProduct.affiliateLink);
    } catch (error) {
        console.error("❌ Error adding product:", error);
    }

    process.exit(0);
}

addTestProduct();
