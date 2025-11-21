export interface AuthConfig {
    region: string;
    apiKey: string;
    apiSecret: string;
}

export interface Interaction {
    id: string;
    interactionGuid: string;
    agentName: string;
    timestamp: string;
    queue: string;
    direction: string;
    duration?: string;
    // New fields for dynamic filtering
    telephony?: {
        direction?: string;
        callerName?: string;
        dialedPhoneNumber?: string;
        [key: string]: any;
    };
    media?: {
        interactionDuration?: number;
        [key: string]: any;
    };
    speechAnalysis?: {
        overallEmotion?: string;
        [key: string]: any;
    };
    customFields?: Record<string, { value: string | null; displayName: string }>;
}

export interface Evaluation {
    id: string;
    interactionGuid: string;
    agentName: string;
    score: number;
    timestamp: string;
    templateName: string;
    queue: string;
    direction: string;
    sections?: any[]; // For detailed view
    evaluator?: string;
}

export interface TranscriptSegment {
    text: string;
    speaker: 'caller' | 'agent';
    timestamp: number;
    sentiment?: string;
}

let cachedToken: string | null = null;
let tokenExpiration: number = 0;

export const getAccessToken = async (config: AuthConfig): Promise<string> => {
    const now = Date.now();
    // Return cached token if it exists and is valid (with 60s buffer)
    if (cachedToken && now < tokenExpiration - 60000) {
        return cachedToken;
    }

    const credentials = btoa(`${config.apiKey}:${config.apiSecret}`);

    console.log('Requesting access token from https://api.8x8.com/oauth/v2/token');

    const response = await fetch('https://api.8x8.com/oauth/v2/token', {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Token request failed:', response.status, response.statusText, errorText);
        throw new Error(`Failed to get access token: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();

    cachedToken = data.access_token;
    // expires_in is in seconds, convert to ms. Default to 1 hour if missing.
    const expiresInMs = (data.expires_in || 3600) * 1000;
    tokenExpiration = now + expiresInMs;

    return data.access_token;
};

export type Region = 'us-east-1' | 'us-west' | 'us-west-8x8' | 'uk' | 'us-west-stats' | 'us-east-stats';

export const searchInteractions = async (config: AuthConfig, filters: any, onProgress?: (count: number, total?: number) => void): Promise<Interaction[]> => {
    try {
        const token = await getAccessToken(config);

        // Format dates for the new API (YYYY-MM-DD HH:MM:SS)
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        const endDate = filters.endDate ? new Date(filters.endDate) : now;
        const startDate = filters.startDate ? new Date(filters.startDate) : sevenDaysAgo;

        // Helper to format date as YYYY-MM-DD HH:MM:SS
        const formatDateTime = (date: Date) => {
            const pad = (n: number) => n.toString().padStart(2, '0');
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
        };

        const startTS = formatDateTime(startDate);
        const endTS = formatDateTime(endDate);

        let allInteractions: any[] = [];
        let page = 1;
        const limit = 50; // Default page size
        const batchSize = 5; // Number of parallel requests
        let hasMore = true;

        let totalInteractions = 0;

        // Loop to fetch all pages in batches
        while (hasMore) {
            const promises = [];
            for (let i = 0; i < batchSize; i++) {
                const currentPage = page + i;
                const queryParams = new URLSearchParams({
                    startTS: startTS,
                    endTS: endTS,
                    interactionType: 'voiceInteraction',
                    page: currentPage.toString(),
                    limit: limit.toString()
                });

                if (filters.interactionId) queryParams.append('interactionGuid', filters.interactionId);

                const url = `https://api.8x8.com/qm/${config.region}/v1/interactions?${queryParams.toString()}`;
                console.log(`Searching interactions (Page ${currentPage}): ${url}`);

                promises.push(
                    fetch(url, {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'pbx': 'trajectordisabili',
                            'Accept': 'application/json'
                        }
                    }).then(async res => {
                        if (!res.ok) {
                            const text = await res.text();
                            console.warn(`Failed to fetch page ${currentPage}: ${res.status} ${text}`);
                            return []; // Return empty on error to allow other pages to succeed
                        }
                        const data = await res.json();

                        // Capture total if available (usually in the first response)
                        if (data.total || data.totalElements) {
                            const t = data.total || data.totalElements;
                            if (t > totalInteractions) totalInteractions = t;
                        }

                        return Array.isArray(data) ? data : (data.interactions || data.content || []);
                    })
                );
            }

            const results = await Promise.all(promises);

            let batchHasMore = true;
            let batchCount = 0;

            for (const content of results) {
                if (content.length === 0) {
                    batchHasMore = false;
                } else {
                    allInteractions = [...allInteractions, ...content];
                    batchCount += content.length;
                    if (content.length < limit) {
                        batchHasMore = false;
                    }
                }
            }

            if (onProgress) {
                onProgress(allInteractions.length, totalInteractions);
            }

            if (!batchHasMore) {
                hasMore = false;
            } else {
                page += batchSize;
            }

            // Safety break
            if (page > 100) {
                console.warn('Reached max page limit (100), stopping fetch.');
                hasMore = false;
            }
        }

        console.log(`Total interactions fetched: ${allInteractions.length}`);

        return allInteractions.map((item: any) => {
            // Helper to format duration (seconds to MM:SS)
            const formatDuration = (seconds: number) => {
                if (!seconds) return '00:00';
                const mins = Math.floor(seconds / 60);
                const secs = Math.floor(seconds % 60);
                return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            };

            return {
                id: item.interactionGuid || item.id,
                interactionGuid: item.interactionGuid,
                agentName: item.agent?.name || item.agentName || 'Unknown Agent',
                timestamp: item.createdAt || item.interactionTime || new Date().toISOString(),
                queue: item.customFields?.customField17?.value || item.agent?.mainGroup || item.queueName || 'General',
                direction: item.telephony?.direction || item.direction || 'inbound',
                duration: formatDuration(item.media?.interactionDuration || 0),
                // Map new fields
                telephony: item.telephony,
                media: item.media,
                speechAnalysis: item.speechAnalysis,
                customFields: item.customFields
            };
        });

    } catch (error) {
        console.error('API Service Error:', error);
        throw error;
    }
};

export const searchEvaluations = async (config: AuthConfig, filters: any): Promise<Evaluation[]> => {
    try {
        const token = await getAccessToken(config);

        // Format dates for the new API (YYYY-MM-DD HH:MM:SS)
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        const endDate = filters.endDate ? new Date(filters.endDate) : now;
        const startDate = filters.startDate ? new Date(filters.startDate) : sevenDaysAgo;

        // Helper to format date as YYYY-MM-DD HH:MM:SS
        const formatDateTime = (date: Date) => {
            const pad = (n: number) => n.toString().padStart(2, '0');
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
        };

        const startTS = formatDateTime(startDate);
        const endTS = formatDateTime(endDate);

        const queryParams = new URLSearchParams({
            startTS: startTS,
            endTS: endTS,
            interactionType: 'voiceInteraction',
            page: '1'
        });

        // Add optional filter parameters if they exist
        if (filters.interactionId) queryParams.append('interactionGuid', filters.interactionId);
        // Note: The API docs mention 'userReference' but we'll try 'agentId' or map it if needed.
        // Assuming 'agentId' might work or we need to know the userReference.
        // For now, let's try passing it as 'agentId' or 'userReference' if the user inputs it.
        // If the user inputs an agent name/ID, we'll try to pass it.
        // However, the docs say 'userReference' is a double (ID).
        if (filters.agentId) queryParams.append('agentId', filters.agentId);
        if (filters.templateName) queryParams.append('templateName', filters.templateName);

        // Use the specific endpoint provided
        const url = `https://api.8x8.com/qm/${config.region}/v1/evaluations?${queryParams.toString()}`;

        console.log(`Searching evaluations at: ${url}`);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'pbx': 'trajectordisabili', // Hardcoded as requested
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Evaluation search failed:', response.status, response.statusText, errorText);
            throw new Error(JSON.stringify({
                type: 'API_ERROR',
                status: response.status,
                statusText: response.statusText,
                url: url,
                details: errorText
            }, null, 2));
        }

        const data = await response.json();

        const content = Array.isArray(data) ? data : (data.evaluations || data.content || []);

        return content.map((item: any) => ({
            id: item.evaluationId?.toString() || item.id,
            interactionGuid: item.interactionGuid,
            agentName: item.agent?.name || item.agentName || 'Unknown Agent',
            score: item.result?.score ?? item.score ?? 0,
            timestamp: item.createdAt || item.interactionTime || new Date().toISOString(),
            templateName: item.templateName || 'Standard',
            queue: item.agent?.mainGroup || item.queueName || 'General',
            direction: item.direction || 'inbound' // Direction is not explicitly in the payload, defaulting
        }));

    } catch (error) {
        console.error('API Service Error:', error);
        throw error;
    }
};

export const getEvaluation = async (config: AuthConfig, interactionGuid: string, evaluationId?: string): Promise<Evaluation | null> => {
    try {
        const token = await getAccessToken(config);
        let targetId = evaluationId;
        let basicInfo: any = null;

        // 1. If no ID provided, search for the evaluation to get the ID
        if (!targetId) {
            const searchUrl = `https://api.8x8.com/qm/${config.region}/v1/evaluations?interactionGuid=${interactionGuid}`;
            console.log(`Searching for evaluation: ${searchUrl}`);

            const searchResponse = await fetch(searchUrl, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json',
                },
            });

            if (!searchResponse.ok) {
                if (searchResponse.status === 404) return null;
                throw new Error(`Failed to search evaluation: ${searchResponse.statusText}`);
            }

            const searchData = await searchResponse.json();
            const evaluations = searchData.content || searchData.evaluations || [];

            if (evaluations.length === 0) return null;

            basicInfo = evaluations[0];
            targetId = basicInfo.evaluationId || basicInfo.id;
        }

        if (!targetId) return null;

        // 2. Fetch detailed evaluation data
        const detailsUrl = `https://api.8x8.com/qm/${config.region}/v1/evaluations/${targetId}`;
        console.log(`Fetching evaluation details: ${detailsUrl}`);

        const detailsResponse = await fetch(detailsUrl, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'pbx': 'trajectordisabili', // Hardcoded as requested
                'Accept': 'application/json',
            },
        });

        if (!detailsResponse.ok) {
            console.warn(`Failed to fetch evaluation details: ${detailsResponse.statusText}. Returning basic info.`);

            if (basicInfo) {
                // Fallback to basic info if details fail and we have it
                return {
                    id: targetId.toString(),
                    interactionGuid: basicInfo.interactionGuid,
                    agentName: basicInfo.agent?.name || basicInfo.agentName || 'Unknown Agent',
                    score: basicInfo.result?.score ?? basicInfo.score ?? 0,
                    timestamp: basicInfo.createdAt || basicInfo.interactionTime || new Date().toISOString(),
                    templateName: basicInfo.templateName || 'Standard',
                    queue: basicInfo.agent?.mainGroup || basicInfo.queueName || 'General',
                    direction: basicInfo.direction || 'inbound'
                };
            }
            return null;
        }

        const detailsData = await detailsResponse.json();

        // Merge basic info with details (detailsData usually has everything, but fallback to basicInfo if needed)
        return {
            id: targetId.toString(),
            interactionGuid: detailsData.interactionGuid || (basicInfo?.interactionGuid),
            agentName: detailsData.agent?.name || detailsData.agentName || (basicInfo?.agent?.name) || 'Unknown Agent',
            score: detailsData.result?.score ?? detailsData.score ?? (basicInfo?.result?.score) ?? 0,
            timestamp: detailsData.createdAt || detailsData.interactionTime || (basicInfo?.createdAt) || new Date().toISOString(),
            templateName: detailsData.templateName || (basicInfo?.templateName) || 'Standard',
            queue: detailsData.agent?.mainGroup || detailsData.queueName || (basicInfo?.agent?.mainGroup) || 'General',
            direction: detailsData.direction || (basicInfo?.direction) || 'inbound',
            // Add detailed fields
            sections: detailsData.sections || [],
            evaluator: detailsData.evaluatorName || 'System'
        };

    } catch (error) {
        console.error('Error fetching evaluation:', error);
        return null;
    }
};

export const getInteraction = async (config: AuthConfig, interactionGuid: string): Promise<Interaction> => {
    try {
        const token = await getAccessToken(config);
        const url = `https://api.8x8.com/qm/${config.region}/v1/interactions/${interactionGuid}`;
        console.log(`Fetching interaction details: ${url}`);

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'pbx': 'trajectordisabili', // Hardcoded as requested
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch interaction: ${response.statusText}`);
        }

        const item = await response.json();

        // Helper to format duration (seconds to MM:SS)
        const formatDuration = (seconds: number) => {
            if (!seconds) return '00:00';
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        };

        return {
            id: item.interactionGuid || item.id,
            interactionGuid: item.interactionGuid,
            agentName: item.agent?.name || item.agentName || 'Unknown Agent',
            timestamp: item.createdAt || item.interactionTime || new Date().toISOString(),
            queue: item.customFields?.customField17?.value || item.agent?.mainGroup || item.queueName || 'General',
            direction: item.telephony?.direction || item.direction || 'inbound',
            duration: formatDuration(item.media?.interactionDuration || 0)
        };
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
};

export const getTranscript = async (config: AuthConfig, interactionGuid: string): Promise<TranscriptSegment[]> => {
    try {
        const token = await getAccessToken(config);
        // Reverting to qm/{region} endpoint but trying 'transcriptions' (plural) as per standard docs
        // If 'transcription' (singular) failed, let's try plural.
        // Also, let's try to be robust about the path.
        // Also, let's try to be robust about the path.
        const url = `https://api.8x8.com/qm/${config.region}/v1/interactions/${interactionGuid}/transcriptions`;
        console.log(`Fetching transcript: ${url}`);

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'pbx': 'trajectordisabili', // Hardcoded as requested
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            // If 404, it might mean no transcript exists, return empty
            if (response.status === 404) return [];
            throw new Error(`Failed to fetch transcript: ${response.statusText}`);
        }

        const data = await response.json();

        const segments = data.transcription || data.transcriptions || (Array.isArray(data) ? data : []);

        return segments.map((item: any) => ({
            text: item.text || item.content,
            speaker: (item.channel === 'external' || item.speaker === 'customer') ? 'caller' : 'agent',
            timestamp: (item.timestampStart || item.startTime || 0) / 1000, // Ensure seconds
            sentiment: item.emotion || item.sentiment
        }));
    } catch (error) {
        console.error('API Error:', error);
        return [];
    }
};
