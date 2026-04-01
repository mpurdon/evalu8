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

// Handles: 555-123-4567, (555) 123-4567, 5551234567, +1 555 123 4567, etc.
export const normalizePhoneNumber = (raw: string): string => {
    const stripped = raw.trim().replace(/[^\d+]/g, '');
    if (/^\+\d{7,15}$/.test(stripped)) return stripped;
    const digits = stripped.replace(/\D/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return `+${digits}`;
};

const formatDateTime = (date: Date): string => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const formatDuration = (seconds: number): string => {
    if (!seconds) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const mapInteractionItem = (item: any): Interaction => ({
    id: item.interactionGuid || item.id,
    interactionGuid: item.interactionGuid,
    agentName: item.agent?.name || item.agentName || 'Unknown Agent',
    timestamp: item.createdAt || item.interactionTime || new Date().toISOString(),
    queue: item.customFields?.customField17?.value || item.agent?.mainGroup || item.queueName || 'General',
    direction: item.telephony?.direction || item.direction || 'inbound',
    duration: formatDuration(item.media?.interactionDuration || 0),
    telephony: item.telephony,
    media: item.media,
    speechAnalysis: item.speechAnalysis,
    customFields: item.customFields,
});

export interface SearchProgress {
    scanned: number;
    windowStart: Date;
    windowEnd: Date;
    windowIndex: number;
    totalWindows: number;
}

export const searchInteractions = async (
    config: AuthConfig,
    filters: any,
    onProgress?: (progress: SearchProgress) => void,
): Promise<Interaction[]> => {
    try {
        const token = await getAccessToken(config);

        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        const overallEnd = filters.endDate ? new Date(filters.endDate) : now;
        const overallStart = filters.maxLookback
            ? new Date(now.getTime() - 5 * 365 * 24 * 60 * 60 * 1000)
            : (filters.startDate ? new Date(filters.startDate) : sevenDaysAgo);

        // For phone lookups the API caps results at ~10,000 per query window.
        // Split into monthly chunks, most-recent first, and run several concurrently.
        const dateWindows: Array<{ start: Date; end: Date }> = [];
        if (filters.phoneNumber) {
            let chunkEnd = new Date(overallEnd);
            while (chunkEnd > overallStart) {
                const chunkStart = new Date(chunkEnd);
                chunkStart.setMonth(chunkStart.getMonth() - 1);
                if (chunkStart < overallStart) chunkStart.setTime(overallStart.getTime());
                dateWindows.push({ start: new Date(chunkStart), end: new Date(chunkEnd) });
                chunkEnd = new Date(chunkStart);
            }
        } else {
            dateWindows.push({ start: overallStart, end: overallEnd });
        }

        const pageSize = 50;
        const batchSize = 5;
        const windowConcurrency = 4; // parallel monthly windows

        const phoneFilterFn = filters.phoneNumber
            ? (() => {
                const targetLast10 = filters.phoneNumber.replace(/\D/g, '').slice(-10);
                return (item: any) => {
                    const callerLast10 = item.telephony?.callerPhoneNumber ? String(item.telephony.callerPhoneNumber).replace(/\D/g, '').slice(-10) : null;
                    const dialedLast10 = item.telephony?.dialedPhoneNumber ? String(item.telephony.dialedPhoneNumber).replace(/\D/g, '').slice(-10) : null;
                    return callerLast10 === targetLast10 || dialedLast10 === targetLast10;
                };
            })()
            : null;

        const fetchPage = async (startTS: string, endTS: string, currentPage: number, attempt = 1): Promise<any[]> => {
            const queryParams = new URLSearchParams({
                startTS,
                endTS,
                interactionType: 'voiceInteraction',
                page: currentPage.toString(),
                limit: pageSize.toString(),
            });

            if (filters.interactionId) queryParams.append('interactionGuid', filters.interactionId);

            const url = `https://api.8x8.com/qm/${config.region}/v1/interactions?${queryParams.toString()}`;

            let res: Response;
            try {
                res = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'pbx': 'trajectordisabili',
                        'Accept': 'application/json',
                    },
                });
            } catch (networkErr) {
                if (attempt <= 3) {
                    const delay = 500 * Math.pow(2, attempt - 1);
                    await new Promise(r => setTimeout(r, delay));
                    return fetchPage(startTS, endTS, currentPage, attempt + 1);
                }
                throw networkErr;
            }

            if (!res.ok) {
                if (attempt <= 3 && res.status >= 500) {
                    const delay = 500 * Math.pow(2, attempt - 1);
                    await new Promise(r => setTimeout(r, delay));
                    return fetchPage(startTS, endTS, currentPage, attempt + 1);
                }
                const text = await res.text();
                throw new Error(`Page ${currentPage}: ${res.status} ${text}`);
            }

            const data = await res.json();
            return Array.isArray(data) ? data : (data.interactions || data.content || []);
        };

        const matched: Interaction[] = [];
        let totalScanned = 0;
        // Only report progress from the window furthest along (highest index = furthest back in time).
        // This prevents jitter from faster/slower concurrent windows jumping the bar backwards.
        let forerunnerIndex = -1;

        const processWindow = async (period: { start: Date; end: Date }, windowIndex: number) => {
            const startTS = formatDateTime(period.start);
            const endTS = formatDateTime(period.end);
            let page = 1;
            let hasMore = true;

            while (hasMore) {
                const promises: Promise<any[] | null>[] = [];
                for (let i = 0; i < batchSize; i++) {
                    const currentPage = page + i;
                    promises.push(fetchPage(startTS, endTS, currentPage).catch(err => {
                        console.error(`Giving up on page ${currentPage}:`, err);
                        return null;
                    }));
                }

                const results = await Promise.all(promises);
                let batchHasMore = true;
                let batchScanned = 0;

                for (const content of results) {
                    if (content === null) {
                        batchHasMore = false;
                    } else if (content.length === 0) {
                        batchHasMore = false;
                    } else {
                        batchScanned += content.length;
                        for (const item of content) {
                            if (!phoneFilterFn || phoneFilterFn(item)) {
                                matched.push(mapInteractionItem(item));
                            }
                        }
                        if (content.length < pageSize) batchHasMore = false;
                    }
                }

                if (batchScanned > 0) {
                    totalScanned += batchScanned;
                    // Only emit if this window is the new forerunner (furthest back in time)
                    if (windowIndex > forerunnerIndex) {
                        forerunnerIndex = windowIndex;
                        onProgress?.({
                            scanned: totalScanned,
                            windowStart: period.start,
                            windowEnd: period.end,
                            windowIndex,
                            totalWindows: dateWindows.length,
                        });
                    }
                }

                if (!batchHasMore) {
                    hasMore = false;
                } else {
                    page += batchSize;
                    if (page > 200) hasMore = false;
                }
            }
        };

        // Process windows in concurrent groups
        for (let i = 0; i < dateWindows.length; i += windowConcurrency) {
            const group = dateWindows.slice(i, i + windowConcurrency);
            await Promise.all(group.map((period, j) => processWindow(period, i + j)));
        }

        console.log(`[phone filter] ${matched.length} matched out of ${totalScanned} scanned`);
        return matched;

    } catch (error) {
        console.error('API Service Error:', error);
        throw error;
    }
};

export const searchEvaluations = async (config: AuthConfig, filters: any): Promise<Evaluation[]> => {
    try {
        const token = await getAccessToken(config);

        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        const endDate = filters.endDate ? new Date(filters.endDate) : now;
        const startDate = filters.startDate ? new Date(filters.startDate) : sevenDaysAgo;

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
        return mapInteractionItem(item);
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
