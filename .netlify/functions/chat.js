const { GoogleGenerativeAI } = require('@google/generative-ai');
const admin = require('firebase-admin');

// Initialize Firebase Admin (only once)
if (!admin.apps.length) {
    try {
        console.log('FIREBASE_SERVICE_ACCOUNT exists:', !!process.env.FIREBASE_SERVICE_ACCOUNT);
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        console.log('Service account parsed successfully, project_id:', serviceAccount.project_id);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log('Firebase initialized successfully');
    } catch (error) {
        console.error('Failed to initialize Firebase:', error.message);
        console.error('Full error:', error);
    }
}

const db = admin.firestore();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

exports.handler = async function (event, context) {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { 
            statusCode: 405, 
            headers,
            body: JSON.stringify({ error: 'Method Not Allowed' })
        };
    }

    // Generate session ID for this conversation
    const sessionId = generateSessionId();
    
    try {
        if (!process.env.GEMINI_API_KEY) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'API key not configured' }),
            };
        }

        const { history, message, systemPrompt } = JSON.parse(event.body);

        // Log the user message to Firebase
        await logToFirebase({
            sessionId,
            timestamp: new Date(),
            type: 'user_message',
            message: message,
            historyLength: history.length,
            userAgent: event.headers['user-agent'] || 'unknown'
        });

        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash"
        });

        const chatHistory = [
            {
                role: "user",
                parts: [{ text: systemPrompt }],
            },
            {
                role: "model", 
                parts: [{ text: "I understand. I am an empathetic AI counselor ready to provide support. How can I help you today?" }],
            },
            ...history
        ];

        const chat = model.startChat({
            history: chatHistory,
            generationConfig: {
                maxOutputTokens: 1024,
                temperature: 0.7,
            },
        });

        const result = await chat.sendMessage(message);
        const response = await result.response;
        const text = response.text();

        // Log the AI response to Firebase
        await logToFirebase({
            sessionId,
            timestamp: new Date(),
            type: 'ai_response',
            message: text,
            responseLength: text.length
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ message: text }),
        };

    } catch (error) {
        console.error("Error in chat function:", error);
        
        // Log errors to Firebase too
        await logToFirebase({
            sessionId,
            timestamp: new Date(),
            type: 'error',
            error: error.message,
            stack: error.stack
        });

        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: "Failed to get response from AI service. Please try again." 
            }),
        };
    }
};

// Function to log data to Firebase
async function logToFirebase(data) {
    try {
        console.log('Attempting to log to Firebase, admin apps length:', admin.apps.length);
        if (admin.apps.length > 0) {
            console.log('Firebase app exists, attempting to write to Firestore...');
            const result = await db.collection('chat_logs').add(data);
            console.log('Successfully logged to Firebase with ID:', result.id);
            console.log('Logged data type:', data.type);
        } else {
            console.log('No Firebase app initialized, skipping log');
        }
    } catch (error) {
        console.error('Failed to log to Firebase:', error.message);
        console.error('Full Firebase error:', error);
        // Don't throw error - logging shouldn't break the main functionality
    }
}

// Generate unique session ID
function generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}