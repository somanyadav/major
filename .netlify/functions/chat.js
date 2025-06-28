const { GoogleGenerativeAI } = require('@google/generative-ai');

// Get the API key from environment variable
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

exports.handler = async function (event, context) {
    // Add CORS headers for preflight requests
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };

    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: '',
        };
    }

    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return { 
            statusCode: 405, 
            headers,
            body: JSON.stringify({ error: 'Method Not Allowed' })
        };
    }

    try {
        // Check if API key exists
        if (!process.env.GEMINI_API_KEY) {
            console.error('GEMINI_API_KEY not found in environment variables');
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'API key not configured' }),
            };
        }

        const { history, message, systemPrompt } = JSON.parse(event.body);

        // Use the updated model name
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash" // Updated model name
        });

        // Build the chat history for the API call
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
                temperature: 0.7, // Add some creativity but keep it controlled
            },
        });

        const result = await chat.sendMessage(message);
        const response = await result.response;
        const text = response.text();

        // Send the response back
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ message: text }),
        };

    } catch (error) {
        console.error("Error calling Gemini API:", error);
        
        // More detailed error logging
        console.error("Error details:", {
            message: error.message,
            stack: error.stack,
            apiKey: process.env.GEMINI_API_KEY ? 'Present' : 'Missing'
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