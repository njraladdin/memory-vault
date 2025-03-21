//background.js 

// Configuration constants
const MEMORY_SEARCH_THRESHOLD = 0.4;  // Lowered from 0.2
const USER_MESSAGE_CHAR_LIMIT = 4000;
const EMBEDDING_BYTE_LIMIT = 1000;
const DB_NAME = 'MemoryVaultDB';
const DB_VERSION = 1;
const STORE_NAME = 'memories';
const GEMINI_MODEL = 'gemini-2.0-flash';
const EMBEDDING_MODEL = 'text-embedding-004';
const TITLE_SIMILARITY_THRESHOLD = 0.1;  // Lowered from 0.3
const TIME_DECAY_FACTOR = 0.05;  // Lowered from 0.1
const LENGTH_NORMALIZATION_FACTOR = 0.3;  // Lowered from 0.5
const MAX_MEMORIES_PER_MESSAGE = 30;  // Add this with other constants at the top

// Add new constants for topic weighting
const TOPIC_CATEGORIES = {
    CODING: ['code', 'programming', 'developer', 'software', 'extension', 'browser', 'javascript', 'python', 'api', 'chatbot', 'ai', 'computer', 'tech', 'database', 'web', 'app', 'development', 'github', 'debugging', 'coding'],
    
    FITNESS: ['workout', 'exercise', 'fitness', 'gym', 'pain', 'muscle', 'training', 'leg', 'strength', 'cardio', 'running', 'sports', 'health', 'nutrition', 'diet', 'weight', 'physical', 'athletic'],
    
    CAREER: ['job', 'work', 'career', 'professional', 'business', 'company', 'interview', 'salary', 'promotion', 'office', 'workplace', 'colleague', 'manager', 'employment', 'startup', 'entrepreneur'],
    
    EDUCATION: ['study', 'learning', 'school', 'university', 'college', 'degree', 'course', 'education', 'student', 'teacher', 'academic', 'research', 'knowledge', 'exam', 'class', 'lecture'],
    
    RELATIONSHIPS: ['family', 'friend', 'partner', 'relationship', 'marriage', 'dating', 'social', 'communication', 'love', 'parent', 'child', 'sibling', 'spouse', 'romantic', 'connection'],
    
    HEALTH: ['medical', 'health', 'doctor', 'illness', 'condition', 'medication', 'therapy', 'mental', 'anxiety', 'depression', 'stress', 'sleep', 'wellness', 'diagnosis', 'treatment', 'healthcare'],
    
    FINANCE: ['money', 'finance', 'investment', 'budget', 'saving', 'expense', 'income', 'financial', 'bank', 'debt', 'credit', 'tax', 'salary', 'economy', 'stock', 'crypto'],
    
    HOBBIES: ['hobby', 'art', 'music', 'reading', 'writing', 'gaming', 'travel', 'photography', 'cooking', 'gardening', 'craft', 'creative', 'collection', 'entertainment', 'leisure'],
    
    LIFESTYLE: ['home', 'living', 'lifestyle', 'habit', 'routine', 'organization', 'productivity', 'goal', 'personal', 'time', 'planning', 'schedule', 'balance', 'life'],
    
    FOOD: ['food', 'cooking', 'diet', 'recipe', 'meal', 'restaurant', 'eating', 'cuisine', 'drink', 'nutrition', 'vegetarian', 'vegan', 'ingredient', 'taste'],
    
    TRAVEL: ['travel', 'vacation', 'trip', 'destination', 'country', 'city', 'flight', 'hotel', 'tourism', 'adventure', 'explore', 'journey', 'abroad', 'culture'],
    
    TECHNOLOGY: ['technology', 'device', 'gadget', 'phone', 'computer', 'internet', 'digital', 'online', 'hardware', 'software', 'mobile', 'electronic', 'smart', 'tech'],
    
    BELIEFS: ['belief', 'religion', 'spiritual', 'philosophy', 'value', 'principle', 'faith', 'moral', 'ethics', 'political', 'ideology', 'worldview', 'opinion'],
    
    EMOTIONS: ['emotion', 'feeling', 'mood', 'happiness', 'sadness', 'anger', 'fear', 'joy', 'anxiety', 'stress', 'emotional', 'mental', 'psychological'],
    
    SKILLS: ['skill', 'ability', 'talent', 'expertise', 'competence', 'experience', 'knowledge', 'capability', 'proficiency', 'mastery', 'learning', 'practice'],
    
    GOALS: ['goal', 'ambition', 'aspiration', 'dream', 'plan', 'objective', 'target', 'achievement', 'success', 'milestone', 'progress', 'future', 'vision'],
    
    CHALLENGES: ['challenge', 'problem', 'difficulty', 'obstacle', 'struggle', 'issue', 'conflict', 'crisis', 'trouble', 'concern', 'worry', 'setback'],
    
    LOCATION: ['location', 'place', 'address', 'city', 'country', 'region', 'area', 'neighborhood', 'residence', 'living', 'moving', 'relocation']
};

// Helper function to detect topic relevance
function getTopicRelevance(text, queryText) {
    // Add safety checks for undefined inputs
    if (!text || !queryText) return 1;  // Return neutral weight if either input is missing
    
    text = text.toLowerCase();
    queryText = queryText.toLowerCase();
    
    // Determine query topics
    const queryTopics = Object.entries(TOPIC_CATEGORIES).filter(([category, keywords]) => 
        keywords.some(keyword => queryText.includes(keyword))
    ).map(([category]) => category);
    
    // If no specific topics detected in query, return 1 (neutral weight)
    if (queryTopics.length === 0) return 1;
    
    // Check if memory matches query topics
    const memoryTopics = Object.entries(TOPIC_CATEGORIES).filter(([category, keywords]) => 
        keywords.some(keyword => text.includes(keyword))
    ).map(([category]) => category);
    
    // Calculate topic relevance score
    const topicMatch = queryTopics.some(topic => memoryTopics.includes(topic));
    return topicMatch ? 2.0 : 0.5; // Boost matching topics, penalize non-matching
}

// Function to get embedding from Google API
async function getEmbedding(text) {
    console.log('Fetching embedding for text:', text);
    
    // Get the API key from storage
    const result = await chrome.storage.local.get('google_api_key');
    const apiKey = result.google_api_key;
    
    if (!apiKey) {
        throw new Error('Google API key not found in storage');
    }
    
    const encoder = new TextEncoder();
    const encodedText = encoder.encode(text);
    const slicedText = encodedText.slice(0, EMBEDDING_BYTE_LIMIT);
    const decoder = new TextDecoder('utf-8');
    const limitedText = decoder.decode(slicedText);

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: `models/${EMBEDDING_MODEL}`,
                content: {
                    parts: [{
                        text: limitedText
                    }]
                }
            })
        }
    );

    const data = await response.json();
    console.log('Received embedding response:', data);

    if (data.error || !data.embedding || !data.embedding.values) {
        throw new Error(data.error?.message || 'Invalid response from embedding API.');
    }
    return data.embedding.values;
}

// Cosine similarity function for comparing embeddings
function cosineSimilarity(vecA, vecB) {
    const dotProduct = vecA.reduce((acc, val, i) => acc + val * vecB[i], 0);
    const normA = Math.sqrt(vecA.reduce((acc, val) => acc + val * val, 0));
    const normB = Math.sqrt(vecB.reduce((acc, val) => acc + val * val, 0));
    return dotProduct / (normA * normB);
}

// Initialize IndexedDB
const dbName = DB_NAME;
const dbVersion = DB_VERSION;
const storeName = STORE_NAME;

async function initDB() {
    console.log('Initializing IndexedDB');
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, dbVersion);

        request.onerror = () => {
            console.error('Error opening IndexedDB:', request.error);
            reject(request.error);
        };
        request.onsuccess = () => {
            console.log('IndexedDB initialized successfully');
            resolve(request.result);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName, { keyPath: 'id', autoIncrement: true });
                console.log(`Object store "${storeName}" created`);
            }
        };
    });
}

// Save memory with its embedding
async function saveMemory(text, embedding) {
    console.log('Saving memory:', text);
    const db = await initDB();
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);

    return new Promise((resolve, reject) => {
        const request = store.add({
            text,
            embedding,
            timestamp: Date.now()
        });

        request.onsuccess = () => {
            console.log('Memory saved successfully');
            resolve();
        };
        request.onerror = () => {
            console.error('Error saving memory:', request.error);
            reject(request.error);
        };
    });
}

// Search memories without result limit
async function searchMemories(searchEmbedding, queryText, threshold = MEMORY_SEARCH_THRESHOLD) {
    console.log('Searching memories with threshold:', threshold);
    const db = await initDB();
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);

    return new Promise((resolve, reject) => {
        const request = store.getAll();

        request.onsuccess = () => {
            const memories = request.result;
            console.log(`Retrieved ${memories.length} memories from IndexedDB`);
            
            const currentTime = Date.now();
            const results = memories
                .map(memory => {
                    const similarityScore = cosineSimilarity(searchEmbedding, memory.embedding);
                    const ageInDays = (currentTime - memory.timestamp) / (1000 * 60 * 60 * 24);
                    const timeDecay = Math.exp(-TIME_DECAY_FACTOR * ageInDays);
                    const lengthFactor = 1 / (1 + LENGTH_NORMALIZATION_FACTOR * Math.log(memory.text.length));
                    const topicRelevance = getTopicRelevance(memory.text, queryText);
                    
                    // Adjusted relevance score with topic weighting
                    const relevanceScore = similarityScore * timeDecay * lengthFactor * topicRelevance;

                    return {
                        ...memory,
                        relevanceScore,
                        similarityScore,
                        timeDecay,
                        lengthFactor,
                        topicRelevance
                    };
                })
                .filter(memory => memory.similarityScore >= TITLE_SIMILARITY_THRESHOLD)
                .sort((a, b) => b.relevanceScore - a.relevanceScore)
                .slice(0, MAX_MEMORIES_PER_MESSAGE);  // Limit the number of memories

            console.log(`Found ${results.length} relevant memories after filtering`);
            resolve(results);
        };

        request.onerror = () => {
            console.error('Error fetching memories:', request.error);
            reject(request.error);
        };
    });
}

// Get all memories
async function getAllMemories() {
    console.log('Fetching all memories from IndexedDB');
    const db = await initDB();
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);

    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => {
            const memories = request.result;
            console.log(`Fetched ${memories.length} memories from IndexedDB`);
            
            // Debug: Log ID types for the first few memories
            if (memories.length > 0) {
                console.log('Sample memory IDs and their types:');
                memories.slice(0, 3).forEach(memory => {
                    console.log(`Memory ID: ${memory.id}, Type: ${typeof memory.id}`);
                });
            }
            
            resolve(memories);
        };
        request.onerror = () => {
            console.error('Error retrieving all memories:', request.error);
            reject(request.error);
        };
    });
}

// Helper function to format timestamp
function formatDate(timestamp) {
    return new Date(timestamp).toLocaleString();
}

// Helper function to get relevance description and color
function getRelevanceInfo(score) {
    if (score >= 0.9) return { text: 'Very High Relevance', color: '#28a745' };
    if (score >= 0.7) return { text: 'High Relevance', color: '#17a2b8' };
    if (score >= 0.5) return { text: 'Moderate Relevance', color: '#ffc107' };
    return { text: 'Low Relevance', color: '#dc3545' };
}

// Updated function to extract info using Gemini LLM and save as memories
async function extractInfoWithGemini(userMessage) {
    console.log('Extracting info from user message:', userMessage);
    
    // Get the API key from storage
    const result = await chrome.storage.local.get('google_api_key');
    const apiKey = result.google_api_key;
    
    if (!apiKey) {
        throw new Error('Google API key not found in storage');
    }
    
    // Extract previous memories section if it exists
    let previousRelevantMemories = '';
    const memoriesMatch = userMessage.match(/\[RELEVANT_PAST_MEMORIES_START\]([\s\S]*?)\[RELEVANT_PAST_MEMORIES_END\]/);
    if (memoriesMatch) {
        previousRelevantMemories = memoriesMatch[1];
        userMessage = userMessage.replace(/\[RELEVANT_PAST_MEMORIES_START\][\s\S]*?\[RELEVANT_PAST_MEMORIES_END\]/, '').trim();
    } else {
        // Search for relevant memories if none were provided
        try {
            const searchEmbedding = await getEmbedding(userMessage);
            const relevantMemories = await searchMemories(searchEmbedding);
            if (relevantMemories.length > 0) {
                previousRelevantMemories = relevantMemories
                    .map(memory => memory.text)
                    .join('\n');
                userMessage = `[RELEVANT_PAST_MEMORIES_START]${previousRelevantMemories}[RELEVANT_PAST_MEMORIES_END]\n${userMessage}`;
            }
        } catch (error) {
            console.error('Error searching for relevant memories:', error);
        }
    }
    
    const limitedUserMessage = userMessage.slice(0, USER_MESSAGE_CHAR_LIMIT);
    console.log({limitedUserMessage})
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [
                    {
                        role: "user",
                        parts: [
                            {
                                text: `Context: You are analyzing a user's message to extract ONLY the most significant and permanent information about the user. Be selective - save information that would be valuable months or years from now for understanding the user's identity, beliefs, and major life circumstances.

Previous memories about this user:
${previousRelevantMemories}

From the following user message, extract ONLY significant information that is NOT already captured in previous memories: "${limitedUserMessage}"

STRICT Guidelines:
1. Be selective - only save truly meaningful information
2. Save information that is:
   - Permanent or long-term in nature
   - Core to understanding the user's identity
   - Major life circumstances or changes
   - Significant medical conditions or restrictions
   - Key professional or educational status
   - Important relationships or roles
   - Strong opinions or beliefs that reflect core values
   - Deeply held preferences that define the person
   - Recurring themes or patterns in thinking
   - Fundamental principles they express
   - Strong emotional connections to topics/ideas
   - Expertise or areas of deep knowledge

DO NOT save information that is:
- Temporary states or feelings
- Daily activities or routine events
- Casual or fleeting preferences
- Common experiences
- General knowledge or facts
- Similar to existing memories
- Surface-level opinions without strong conviction

Example input: "I absolutely hate the idea of working in big tech companies. I believe they're destroying privacy and human connection. I'd rather work at a small company where I can make real impact."
✅ Good output: ["User holds strong anti-big-tech values and prioritizes privacy and human connection in their work choices"]
❌ Bad output: ["User prefers small companies"]

Example input: "I'm passionate about sustainable living. I've been vegan for 10 years and actively campaign for environmental causes. Just bought some groceries today."
✅ Good output: ["User is deeply committed to environmentalism and has maintained a vegan lifestyle for 10 years"]
❌ Bad output: ["User bought groceries", "User is vegan"]

Example input: "Thinking about what to have for lunch. Maybe pizza."
✅ Good output: [] // Nothing significant enough to save
❌ Bad output: ["User likes pizza"]

generally, just keep stuff that'll be good / useful to remember in future chats.

Respond with a JSON array containing 0-2 concise memories or more depending on how much information is relevant. Default to an empty array unless the information reveals something truly significant about the user's identity, values, or life circumstances.`
                            }
                        ]
                    }
                ],
                generationConfig: {
                    temperature: 0.2,
                    topK: 20,
                    topP: 0.8,
                    maxOutputTokens: 8192,
                    responseMimeType: "application/json"
                }
            })
        }
    );

    const data = await response.json();
    console.log('Received Gemini response:', data);

    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
        const extractedInfo = JSON.parse(data.candidates[0].content.parts[0].text);
        if (Array.isArray(extractedInfo)) {
            // Save each extracted piece of information as a separate memory
            for (const info of extractedInfo) {
                try {
                    const embedding = await getEmbedding(info);
                    await saveMemory(info, embedding);
                    console.log('Saved extracted info as memory:', info);
                } catch (error) {
                    console.error('Error saving extracted info as memory:', error);
                }
            }
            return extractedInfo;
        } else {
            console.error('Unexpected response format from Gemini API');
            return [];
        }
    } else {
        console.error('Invalid response from Gemini API');
        return [];
    }
}

// Update the interceptNetworkRequests function
function interceptNetworkRequests() {
    chrome.webRequest.onBeforeRequest.addListener(
        function(details) {
            // Handle ChatGPT requests
            if (details.url.includes('chatgpt.com/backend-api/conversation') && details.method === 'POST') {
                handleChatGPTRequest(details);
            }
            
            // Handle Claude requests
            if (details.url.includes('api.claude.ai/api/organizations') && 
                details.url.includes('/completion') && 
                details.method === 'POST') {
                handleClaudeRequest(details);
            }
            
            return { cancel: false };
        },
        { 
            urls: [
                "https://chatgpt.com/backend-api/conversation*",
                "https://api.claude.ai/api/organizations/*/chat_conversations/*/completion*"
            ] 
        },
        ["requestBody"]
    );
}

// Update the handleChatGPTRequest function
function handleChatGPTRequest(details) {
    // First check if infinite memory is enabled
    chrome.storage.local.get('autoSubmitEnabled', (result) => {
        if (!result.autoSubmitEnabled) {
            console.log('Infinite memory disabled - skipping memory storage');
            return;
        }
        
        if (details.requestBody && details.requestBody.raw) {
            const rawData = details.requestBody.raw[0].bytes;
            const decodedString = decodeURIComponent(String.fromCharCode.apply(null, new Uint8Array(rawData)));
            try {
                const payload = JSON.parse(decodedString);
                
                if (payload.messages && payload.messages.length > 0) {
                    const userMessage = payload.messages[payload.messages.length - 1].content.parts.join('\n');
                    console.log('Full user message from ChatGPT:', userMessage);

                    extractInfoWithGemini(userMessage)
                        .then(extractedInfoArray => {
                            console.log('Extracted and saved info from ChatGPT message:', extractedInfoArray);
                        })
                        .catch(error => console.error('Error processing ChatGPT message:', error));
                }
            } catch (error) {
                console.error('Error parsing ChatGPT request payload:', error);
            }
        }
    });
}

// Update the handleClaudeRequest function similarly
function handleClaudeRequest(details) {
    chrome.storage.local.get('autoSubmitEnabled', (result) => {
        if (!result.autoSubmitEnabled) {
            console.log('Infinite memory disabled - skipping memory storage');
            return;
        }
        
        if (details.requestBody && details.requestBody.raw) {
            const rawData = details.requestBody.raw[0].bytes;
            const decodedString = decodeURIComponent(String.fromCharCode.apply(null, new Uint8Array(rawData)));
            try {
                const payload = JSON.parse(decodedString);
                
                if (payload.prompt) {
                    const userMessage = payload.prompt;
                    console.log('Full user message from Claude:', userMessage);

                    extractInfoWithGemini(userMessage)
                        .then(extractedInfoArray => {
                            console.log('Extracted and saved info from Claude message:', extractedInfoArray);
                        })
                        .catch(error => console.error('Error processing Claude message:', error));
                }
            } catch (error) {
                console.error('Error parsing Claude request payload:', error);
            }
        }
    });
}

// Ensure content script is loaded before sending messages
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && 
        (tab.url.includes('chatgpt.com') || tab.url.includes('claude.ai'))) {
        chrome.tabs.sendMessage(tabId, { type: 'TAB_READY' }, function(response) {
            if (chrome.runtime.lastError) {
                console.log('Content script not ready:', chrome.runtime.lastError.message);
            } else {
                console.log('Content script is ready');
            }
        });
    }
});

// Call this function to start intercepting
interceptNetworkRequests();

// Listen for messages from contentScript.js and popup.js
// background.js - Updated message listener
// Only the message listener part needs to change in background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Received message:', request);

    if (request.type === 'SEARCH_MEMORIES') {
        getEmbedding(request.query)
            .then(embedding => searchMemories(embedding, request.query))
            .then(results => {
                sendResponse({ status: 'success', results });
            })
            .catch(error => {
                console.error('Error searching memories:', error);
                sendResponse({ status: 'error', message: 'Failed to search memories.' });
            });
        return true;
    }

    if (request.type === 'SAVE_MEMORY') {
        getEmbedding(request.text)
            .then(embedding => saveMemory(request.text, embedding))
            .then(() => {
                sendResponse({ status: 'success' });
            })
            .catch(error => {
                console.error('Error saving memory:', error);
                sendResponse({ status: 'error', message: 'Failed to save memory.' });
            });
        return true;
    }

    if (request.type === 'GET_ALL_MEMORIES') {
        getAllMemories()
            .then(memories => {
                console.log('GET_ALL_MEMORIES fetched memories:', memories);
                sendResponse({ status: 'success', memories });
            })
            .catch(error => {
                console.error('Error retrieving memories:', error);
                sendResponse({ status: 'error', message: 'Failed to retrieve memories.' });
            });
        return true;
    }

    if (request.type === 'LAST_ARTICLE_TEXT') {
        console.log('Received last article text in background script:', request.text);
        // You can process or store this text as needed
    }

    if (request.type === 'DELETE_MEMORY') {
        // Log the received ID for debugging
        console.log('Received DELETE_MEMORY request with id:', request.id, 'type:', typeof request.id);
        
        deleteMemory(request.id)
            .then(() => {
                sendResponse({ status: 'success' });
            })
            .catch(error => {
                console.error('Error deleting memory:', error);
                sendResponse({ status: 'error', message: 'Failed to delete memory.' });
            });
        return true;
    }

    if (request.type === 'OPEN_POPUP') {
        chrome.tabs.create({
            url: chrome.runtime.getURL('popup.html')
        });
    }

    if (request.type === 'EDIT_MEMORY') {
        // Log the received ID for debugging
        console.log('Received EDIT_MEMORY request with id:', request.id, 'type:', typeof request.id);
        
        getEmbedding(request.text)
            .then(embedding => editMemory(request.id, request.text, embedding))
            .then(() => {
                sendResponse({ status: 'success' });
            })
            .catch(error => {
                console.error('Error editing memory:', error);
                sendResponse({ status: 'error', message: 'Failed to edit memory.' });
            });
        return true;
    }

    console.warn('Unhandled message type:', request.type);
    sendResponse({ status: 'error', message: 'Unhandled message type.' });
    return false;
});

// Add this new function to delete a memory
async function deleteMemory(id) {
    console.log('Deleting memory with id:', id);
    // Convert id to number if it's a string and represents a number
    const numericId = typeof id === 'string' ? parseInt(id, 10) : id;
    console.log('Using numeric id:', numericId);
    
    const db = await initDB();
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);

    return new Promise((resolve, reject) => {
        const request = store.delete(numericId);
        request.onsuccess = () => {
            console.log('Memory deleted successfully');
            resolve();
        };
        request.onerror = () => {
            console.error('Error deleting memory:', request.error);
            reject(request.error);
        };
    });
}

// Add this new function to edit a memory
async function editMemory(id, newText, newEmbedding) {
    console.log('Editing memory with id:', id);
    // Convert id to number if it's a string and represents a number
    const numericId = typeof id === 'string' ? parseInt(id, 10) : id;
    console.log('Using numeric id:', numericId);
    
    const db = await initDB();
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);

    return new Promise((resolve, reject) => {
        const getRequest = store.get(numericId);
        
        getRequest.onsuccess = () => {
            const memory = getRequest.result;
            if (!memory) {
                console.error('Memory not found with id:', numericId);
                reject(new Error('Memory not found'));
                return;
            }

            memory.text = newText;
            memory.embedding = newEmbedding;
            
            const updateRequest = store.put(memory);
            
            updateRequest.onsuccess = () => {
                console.log('Memory updated successfully');
                resolve();
            };
            
            updateRequest.onerror = () => {
                console.error('Error updating memory:', updateRequest.error);
                reject(updateRequest.error);
            };
        };
        
        getRequest.onerror = () => {
            console.error('Error getting memory:', getRequest.error);
            reject(getRequest.error);
        };
    });
}

// Add this near the top with other initialization code
chrome.runtime.onInstalled.addListener(() => {
    // Initialize the autoSubmitEnabled state if it doesn't exist
    chrome.storage.local.get('autoSubmitEnabled', (result) => {
        if (result.autoSubmitEnabled === undefined) {
            chrome.storage.local.set({ autoSubmitEnabled: false });
        }
    });
});

