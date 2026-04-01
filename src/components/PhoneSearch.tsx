import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
    Phone, Search, Loader2, AlertCircle, ArrowDownLeft, ArrowUpRight,
    Clock, Play, Radio, X, CheckCircle2, History, Save, FolderOpen,
    Trash2, RefreshCw, Calendar,
} from 'lucide-react';
import { format } from 'date-fns';
import { searchInteractions, normalizePhoneNumber, Interaction, SearchProgress } from '../services/api';

interface PhoneSearchProps {
    onSelectInteraction: (interaction: Interaction) => void;
}

interface CachedSearch {
    phoneNumber: string;          // E.164 normalized
    searchedAt: string;           // ISO timestamp of when search was run
    overallStart: string;         // ISO — earliest date scanned
    overallEnd: string;           // ISO — latest date scanned
    totalScanned: number;
    results: Interaction[];
}

const CACHE_KEY_PREFIX = 'phonecache:';

function getCacheKey(phoneNumber: string) {
    return `${CACHE_KEY_PREFIX}${phoneNumber}`;
}

function loadCache(phoneNumber: string): CachedSearch | null {
    try {
        const raw = localStorage.getItem(getCacheKey(phoneNumber));
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function saveCache(entry: CachedSearch) {
    localStorage.setItem(getCacheKey(entry.phoneNumber), JSON.stringify(entry));
}

function deleteCache(phoneNumber: string) {
    localStorage.removeItem(getCacheKey(phoneNumber));
}

function listCachedNumbers(): string[] {
    const numbers: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(CACHE_KEY_PREFIX)) {
            numbers.push(key.slice(CACHE_KEY_PREFIX.length));
        }
    }
    return numbers;
}

function formatPhoneDisplay(digits: string): string {
    const d = digits.replace(/\D/g, '');
    if (d.length === 0) return '';
    if (d.length <= 3) return `(${d}`;
    if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
    if (d.length <= 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    return `+${d.slice(0, d.length - 10)} (${d.slice(-10, -7)}) ${d.slice(-7, -4)}-${d.slice(-4)}`;
}

function getDigitCount(value: string): number {
    return value.replace(/\D/g, '').length;
}

function isValidPhone(value: string): boolean {
    return value.replace(/\D/g, '').length >= 10;
}

export const PhoneSearch: React.FC<PhoneSearchProps> = ({ onSelectInteraction }) => {
    const [rawInput, setRawInput] = useState('');
    const [displayValue, setDisplayValue] = useState('');
    const [normalizedPreview, setNormalizedPreview] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [results, setResults] = useState<Interaction[] | null>(null);
    const [searchedNumber, setSearchedNumber] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<SearchProgress | null>(null);
    const [validationError, setValidationError] = useState('');
    const [inputFocused, setInputFocused] = useState(false);
    const [sortField, setSortField] = useState<'timestamp' | 'agentName' | 'duration'>('timestamp');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [cachedMeta, setCachedMeta] = useState<CachedSearch | null>(null);
    const [cachedNumbers, setCachedNumbers] = useState<string[]>([]);
    const [showSavedList, setShowSavedList] = useState(false);
    const [totalScannedFinal, setTotalScannedFinal] = useState(0);

    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
        setCachedNumbers(listCachedNumbers());
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        const cleaned = raw.replace(/[^\d\s()+\-\.]/g, '');
        setRawInput(cleaned);

        const digits = cleaned.replace(/\D/g, '');
        setDisplayValue(digits.length > 0 ? formatPhoneDisplay(digits) : '');

        if (digits.length >= 10) {
            const norm = normalizePhoneNumber(cleaned);
            setNormalizedPreview(norm);
            setValidationError('');
            setCachedMeta(loadCache(norm));
        } else {
            setNormalizedPreview('');
            setCachedMeta(null);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSearch(false);
    };

    const handleSearch = useCallback(async (forceRefresh: boolean) => {
        if (!rawInput.trim()) { setValidationError('Please enter a phone number'); return; }
        if (!isValidPhone(rawInput)) { setValidationError('Please enter a valid 10-digit phone number'); return; }

        const normalized = normalizePhoneNumber(rawInput);
        const apiKey = localStorage.getItem('apiKey') || '';
        const apiSecret = localStorage.getItem('apiSecret') || '';
        const region = localStorage.getItem('region') || 'us-west-stats';

        if (!apiKey || !apiSecret) { setError('API credentials not configured. Please visit Settings.'); return; }

        // Load from cache unless force-refreshing
        if (!forceRefresh) {
            const cached = loadCache(normalized);
            if (cached) {
                setResults(cached.results);
                setSearchedNumber(cached.phoneNumber);
                setTotalScannedFinal(cached.totalScanned);
                setCachedMeta(cached);
                return;
            }
        }

        setIsLoading(true);
        setError(null);
        setResults(null);
        setProgress(null);
        setTotalScannedFinal(0);
        setSearchedNumber(normalized);
        setValidationError('');
        setCachedMeta(null);

        const now = new Date();
        const overallStart = new Date(now.getTime() - 5 * 365 * 24 * 60 * 60 * 1000);

        let finalScanned = 0;
        let finalWindowStart = overallStart;
        try {
            const data = await searchInteractions(
                { apiKey, apiSecret, region },
                { phoneNumber: normalized, maxLookback: true },
                (p) => { setProgress(p); finalScanned = p.scanned; finalWindowStart = p.windowStart; },
            );

            const entry: CachedSearch = {
                phoneNumber: normalized,
                searchedAt: new Date().toISOString(),
                overallStart: finalWindowStart.toISOString(),
                overallEnd: now.toISOString(),
                totalScanned: finalScanned,
                results: data,
            };
            saveCache(entry);
            setCachedNumbers(listCachedNumbers());
            setCachedMeta(entry);
            setTotalScannedFinal(finalScanned);
            setResults(data);
        } catch (err: any) {
            let msg = err.message;
            try { msg = JSON.stringify(JSON.parse(err.message), null, 2); } catch (_) {}
            setError(msg);
        } finally {
            setIsLoading(false);
        }
    }, [rawInput]);

    const handleLoadSaved = (number: string) => {
        const cached = loadCache(number);
        if (!cached) return;
        setShowSavedList(false);
        const digits = number.replace(/\D/g, '');
        setRawInput(number);
        setDisplayValue(formatPhoneDisplay(digits));
        setNormalizedPreview(number);
        setCachedMeta(cached);
        setResults(cached.results);
        setSearchedNumber(cached.phoneNumber);
        setTotalScannedFinal(cached.totalScanned);
        setProgress(null);
    };

    const handleDeleteSaved = (number: string, e: React.MouseEvent) => {
        e.stopPropagation();
        deleteCache(number);
        const updated = listCachedNumbers();
        setCachedNumbers(updated);
        if (number === searchedNumber) {
            setCachedMeta(null);
        }
    };

    const handleSort = (field: typeof sortField) => {
        if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortDir('asc'); }
    };

    const sortedResults = useMemo(() => {
        if (!results) return [];
        return [...results].sort((a, b) => {
            let av: any, bv: any;
            if (sortField === 'timestamp') {
                av = new Date(a.timestamp).getTime();
                bv = new Date(b.timestamp).getTime();
            } else if (sortField === 'duration') {
                const toSec = (s?: string) => s ? s.split(':').reduce((acc, v, i, arr) => acc + (i === arr.length - 1 ? +v : +v * 60), 0) : 0;
                av = toSec(a.duration); bv = toSec(b.duration);
            } else {
                av = (a.agentName || '').toLowerCase(); bv = (b.agentName || '').toLowerCase();
            }
            if (av < bv) return sortDir === 'asc' ? -1 : 1;
            if (av > bv) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
    }, [results, sortField, sortDir]);

    const digitCount = getDigitCount(rawInput);
    const isReady = digitCount >= 10;

    // Time-based progress: what fraction of the 5-year span have we covered?
    const timeProgress = useMemo(() => {
        if (!progress) return 0;
        const { windowIndex, totalWindows } = progress;
        return totalWindows > 0 ? Math.min((windowIndex + 1) / totalWindows, 1) : 0;
    }, [progress]);

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* ─── Header ─────────────────────────────────────────────────────── */}
            <div className="px-6 pt-6 pb-0 shrink-0">
                <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-3xl font-bold tracking-tight">Phone Lookup</h2>
                    <span className="px-2 py-0.5 rounded-full bg-[#00d2d3]/10 text-[#00d2d3] text-xs font-medium border border-[#00d2d3]/20 flex items-center gap-1">
                        <History size={10} />
                        All History
                    </span>
                    <div className="ml-auto relative">
                        <button
                            onClick={() => setShowSavedList(v => !v)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-white transition-colors"
                            style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}
                        >
                            <FolderOpen size={13} />
                            Saved ({cachedNumbers.length})
                        </button>
                        {showSavedList && (
                            <div
                                className="absolute right-0 top-full mt-1 rounded-xl border z-50 min-w-[220px] overflow-hidden"
                                style={{ background: '#141416', border: '1px solid #2a2a2a', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
                            >
                                {cachedNumbers.length === 0 ? (
                                    <p className="px-4 py-3 text-xs text-gray-600">No saved searches</p>
                                ) : (
                                    cachedNumbers.map(num => {
                                        const c = loadCache(num);
                                        return (
                                            <div
                                                key={num}
                                                onClick={() => handleLoadSaved(num)}
                                                className="flex items-center gap-2 px-3 py-2.5 hover:bg-white/5 cursor-pointer group"
                                            >
                                                <Phone size={12} className="text-[#00d2d3] shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-mono text-white truncate">{num}</p>
                                                    {c && <p className="text-[10px] text-gray-600">{format(new Date(c.searchedAt), 'MMM d, yyyy')} · {c.results.length} calls</p>}
                                                </div>
                                                <button
                                                    onClick={(e) => handleDeleteSaved(num, e)}
                                                    className="text-gray-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 p-0.5"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        )}
                    </div>
                </div>
                <p className="text-sm text-gray-500 mb-5">Search every recorded call for a phone number — no date limits.</p>
            </div>

            {/* ─── Search Card ─────────────────────────────────────────────────── */}
            <div className="px-6 shrink-0">
                <div
                    className="relative rounded-xl border transition-all duration-300"
                    style={{
                        background: 'linear-gradient(135deg, #141416 0%, #18181a 100%)',
                        borderColor: inputFocused ? 'rgba(0,210,211,0.35)' : '#2a2a2a',
                        boxShadow: inputFocused
                            ? '0 0 0 1px rgba(0,210,211,0.15), 0 0 40px rgba(0,210,211,0.08), inset 0 1px 0 rgba(255,255,255,0.04)'
                            : '0 0 0 1px rgba(255,255,255,0.03), inset 0 1px 0 rgba(255,255,255,0.03)',
                    }}
                >
                    <div
                        className="absolute top-0 left-1/2 -translate-x-1/2 h-px transition-all duration-300 rounded-full"
                        style={{
                            width: inputFocused ? '60%' : '0%',
                            background: 'linear-gradient(90deg, transparent, rgba(0,210,211,0.6), transparent)',
                        }}
                    />
                    <div className="p-5">
                        <div className="flex gap-3 items-start">
                            <div className="flex-1 relative">
                                <div className="relative">
                                    <Phone
                                        size={18}
                                        className="absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors duration-200"
                                        style={{ color: inputFocused ? '#00d2d3' : '#555' }}
                                    />
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        value={displayValue || rawInput}
                                        onChange={handleInputChange}
                                        onFocus={() => setInputFocused(true)}
                                        onBlur={() => setInputFocused(false)}
                                        onKeyDown={handleKeyDown}
                                        placeholder="(555) 123-4567"
                                        spellCheck={false}
                                        className="w-full pl-10 pr-4 py-3.5 rounded-lg text-lg font-mono tracking-wider text-white placeholder:text-gray-700 outline-none transition-all duration-200"
                                        style={{
                                            background: '#0f0f10',
                                            border: validationError
                                                ? '1px solid rgba(239,68,68,0.5)'
                                                : inputFocused
                                                    ? '1px solid rgba(0,210,211,0.4)'
                                                    : '1px solid #2a2a2a',
                                            fontSize: '1.1rem',
                                            letterSpacing: '0.05em',
                                        }}
                                    />
                                    {rawInput && (
                                        <button
                                            onClick={() => { setRawInput(''); setDisplayValue(''); setNormalizedPreview(''); setValidationError(''); setCachedMeta(null); setResults(null); }}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition-colors p-0.5 rounded"
                                        >
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>
                                <div className="mt-1.5 h-4 flex items-center">
                                    {validationError ? (
                                        <p className="text-xs text-red-400 flex items-center gap-1">
                                            <AlertCircle size={11} /> {validationError}
                                        </p>
                                    ) : normalizedPreview ? (
                                        <p className="text-xs font-mono flex items-center gap-1.5" style={{ color: '#00d2d3', opacity: 0.7 }}>
                                            <CheckCircle2 size={11} />
                                            Will search as: <span className="font-bold">{normalizedPreview}</span>
                                        </p>
                                    ) : digitCount > 0 && digitCount < 10 ? (
                                        <p className="text-xs text-gray-600">{10 - digitCount} more digit{10 - digitCount !== 1 ? 's' : ''} needed</p>
                                    ) : null}
                                </div>
                            </div>
                            <div className="flex flex-col gap-2 shrink-0">
                                <button
                                    onClick={() => handleSearch(false)}
                                    disabled={isLoading || !isReady}
                                    className="flex items-center gap-2 px-5 py-3.5 rounded-lg font-semibold text-sm transition-all duration-200"
                                    style={{
                                        background: isReady && !isLoading ? 'linear-gradient(135deg, #00d2d3, #00a8b5)' : '#1e1e1e',
                                        color: isReady && !isLoading ? '#000' : '#444',
                                        border: isReady && !isLoading ? 'none' : '1px solid #2a2a2a',
                                        boxShadow: isReady && !isLoading ? '0 4px 20px rgba(0,210,211,0.25)' : 'none',
                                        cursor: isLoading || !isReady ? 'not-allowed' : 'pointer',
                                    }}
                                >
                                    {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                                    {isLoading ? 'Searching...' : (cachedMeta ? 'Load Cache' : 'Find Calls')}
                                </button>
                                {cachedMeta && isReady && !isLoading && (
                                    <button
                                        onClick={() => handleSearch(true)}
                                        className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors text-gray-400 hover:text-white"
                                        style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}
                                        title={`Cached ${format(new Date(cachedMeta.searchedAt), 'MMM d, yyyy h:mm a')} — click to re-scan`}
                                    >
                                        <RefreshCw size={11} />
                                        Refresh
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Cached result banner */}
                        {cachedMeta && results !== null && !isLoading && (
                            <div className="mt-3 pt-3 border-t flex items-center gap-2" style={{ borderColor: '#222' }}>
                                <Save size={11} className="text-gray-600 shrink-0" />
                                <span className="text-xs text-gray-600">
                                    Cached on <span className="text-gray-500">{format(new Date(cachedMeta.searchedAt), 'MMM d, yyyy \'at\' h:mm a')}</span>
                                    {' · '}scanned <span className="text-gray-500">{format(new Date(cachedMeta.overallStart), 'MMM yyyy')}</span> → <span className="text-gray-500">{format(new Date(cachedMeta.overallEnd), 'MMM yyyy')}</span>
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ─── Error ───────────────────────────────────────────────────────── */}
            {error && (
                <div className="mx-6 mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3 shrink-0">
                    <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                    <div className="flex-1 min-w-0">
                        <p className="text-red-400 font-semibold text-sm mb-1">Search failed</p>
                        <pre className="text-red-400/80 text-xs font-mono whitespace-pre-wrap break-all overflow-x-auto">{error}</pre>
                    </div>
                    <button onClick={() => setError(null)} className="text-red-500/60 hover:text-red-400 transition-colors shrink-0">
                        <X size={16} />
                    </button>
                </div>
            )}

            {/* ─── Loading / Progress ──────────────────────────────────────────── */}
            {isLoading && (
                <div className="mx-6 mt-4 shrink-0">
                    <div
                        className="rounded-xl border p-5"
                        style={{ background: 'linear-gradient(135deg, #141416 0%, #18181a 100%)', borderColor: 'rgba(0,210,211,0.15)' }}
                    >
                        <div className="flex items-center gap-4 mb-4">
                            <div className="relative w-10 h-10 shrink-0 flex items-center justify-center">
                                <div className="absolute inset-0 rounded-full animate-ping" style={{ background: 'rgba(0,210,211,0.15)', animationDuration: '1.5s' }} />
                                <div className="absolute inset-1 rounded-full animate-ping" style={{ background: 'rgba(0,210,211,0.1)', animationDuration: '1.5s', animationDelay: '0.3s' }} />
                                <Radio size={16} style={{ color: '#00d2d3', position: 'relative', zIndex: 1 }} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-white mb-0.5">Scanning all call history</p>
                                <p className="text-xs text-gray-500 flex items-center gap-1.5">
                                    <Calendar size={10} />
                                    {progress
                                        ? <>Now scanning <span className="text-gray-400 font-medium">{format(progress.windowStart, 'MMM yyyy')}</span></>
                                        : 'Starting…'
                                    }
                                </p>
                            </div>
                            <div className="text-right shrink-0">
                                <p className="text-xl font-mono font-bold" style={{ color: '#00d2d3' }}>
                                    {(progress?.scanned ?? 0).toLocaleString()}
                                </p>
                                <p className="text-xs text-gray-600">records scanned</p>
                            </div>
                        </div>

                        {/* Time-span progress bar: left=today, right=5 years ago */}
                        <div className="space-y-1">
                            <div className="flex justify-between text-[10px] text-gray-700">
                                <span>Today</span>
                                <span>{progress ? `${Math.round(timeProgress * 100)}%` : ''}</span>
                                <span>{format(new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000), 'MMM yyyy')}</span>
                            </div>
                            <div className="h-1.5 bg-[#1e1e1e] rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-500 ease-out"
                                    style={{
                                        width: `${Math.round(timeProgress * 100)}%`,
                                        background: 'linear-gradient(90deg, #00d2d3, #00a8b5)',
                                        minWidth: timeProgress > 0 ? '4px' : '0',
                                    }}
                                />
                            </div>
                        </div>

                        {progress && (
                            <p className="mt-2 text-[10px] text-gray-700">
                                Window {progress.windowIndex + 1} of {progress.totalWindows}
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* ─── Results ─────────────────────────────────────────────────────── */}
            {results !== null && !isLoading && (
                <div
                    className="flex-1 flex flex-col overflow-hidden mt-4 mx-6 mb-4 rounded-xl border"
                    style={{ borderColor: '#222', background: '#111113', animation: 'fadeInUp 0.3s ease-out' }}
                >
                    <div className="px-5 py-3.5 border-b flex items-center gap-3 shrink-0" style={{ borderColor: '#1e1e1e' }}>
                        <div className="flex items-center gap-2 flex-1">
                            {results.length > 0 ? (
                                <CheckCircle2 size={15} style={{ color: '#00d2d3' }} />
                            ) : (
                                <Phone size={15} className="text-gray-600" />
                            )}
                            <span className="text-sm font-medium text-gray-300">
                                {results.length > 0
                                    ? <><span className="font-bold text-white">{results.length.toLocaleString()}</span> call{results.length !== 1 ? 's' : ''} found{totalScannedFinal > 0 ? <> out of <span className="font-bold text-white">{totalScannedFinal.toLocaleString()}</span> searched</> : ''}</>
                                    : <>No calls found{totalScannedFinal > 0 ? <> in <span className="font-bold text-white">{totalScannedFinal.toLocaleString()}</span> records searched</> : ''}</>
                                }
                            </span>
                        </div>
                        <div
                            className="px-2.5 py-1 rounded-full text-xs font-mono font-semibold flex items-center gap-1.5"
                            style={{ background: 'rgba(0,210,211,0.08)', color: '#00d2d3', border: '1px solid rgba(0,210,211,0.2)' }}
                        >
                            <Phone size={10} />
                            {searchedNumber}
                        </div>
                    </div>

                    {results.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center py-16">
                            <div
                                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                                style={{ background: 'radial-gradient(circle at 50% 50%, rgba(0,210,211,0.08) 0%, transparent 70%)', border: '1px solid #222' }}
                            >
                                <Phone size={28} className="text-gray-700" />
                            </div>
                            <p className="text-gray-400 font-medium mb-1">No calls found</p>
                            <p className="text-gray-600 text-sm">
                                No call history found for <span className="font-mono text-gray-500">{searchedNumber}</span>
                            </p>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="text-xs uppercase tracking-wider sticky top-0 z-10" style={{ background: '#111113', borderBottom: '1px solid #1e1e1e' }}>
                                        <th className="px-4 py-3 text-gray-600 font-medium w-12">#</th>
                                        <SortableTh label="Date" field="timestamp" current={sortField} dir={sortDir} onSort={handleSort} />
                                        <SortableTh label="Agent" field="agentName" current={sortField} dir={sortDir} onSort={handleSort} />
                                        <th className="px-4 py-3 text-gray-600 font-medium">Queue</th>
                                        <th className="px-4 py-3 text-gray-600 font-medium">Direction</th>
                                        <SortableTh label="Duration" field="duration" current={sortField} dir={sortDir} onSort={handleSort} isRight />
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedResults.map((interaction, idx) => (
                                        <tr
                                            key={interaction.id}
                                            onClick={() => onSelectInteraction(interaction)}
                                            className="group cursor-pointer border-b"
                                            style={{ borderColor: '#1a1a1a', animation: `fadeInRow 0.2s ease-out ${Math.min(idx * 0.03, 0.5)}s both` }}
                                            onMouseEnter={e => (e.currentTarget.style.background = '#18181a')}
                                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                        >
                                            <td className="px-4 py-3 text-gray-600 text-sm">
                                                <span className="group-hover:hidden">{idx + 1}</span>
                                                <Play size={13} className="hidden group-hover:block" style={{ color: '#00d2d3' }} />
                                            </td>
                                            <td className="px-4 py-3 text-gray-400 text-sm tabular-nums">
                                                {format(new Date(interaction.timestamp), 'MMM d, yyyy HH:mm')}
                                            </td>
                                            <td className="px-4 py-3 text-white text-sm font-medium">{interaction.agentName}</td>
                                            <td className="px-4 py-3 text-gray-500 text-sm">{interaction.queue}</td>
                                            <td className="px-4 py-3 text-sm">
                                                <div className="flex items-center gap-1.5">
                                                    {interaction.direction === 'inbound'
                                                        ? <ArrowDownLeft size={14} className="text-emerald-400" />
                                                        : <ArrowUpRight size={14} className="text-blue-400" />
                                                    }
                                                    <span className="capitalize text-gray-400">{interaction.direction}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-gray-500 text-sm text-right font-mono tabular-nums">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <Clock size={11} className="text-gray-700" />
                                                    {interaction.duration || '--:--'}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ─── Idle state ──────────────────────────────────────────────────── */}
            {results === null && !isLoading && !error && (
                <div className="flex-1 flex flex-col items-center justify-center text-center pb-12">
                    <div
                        className="w-24 h-24 rounded-3xl flex items-center justify-center mb-6 relative"
                        style={{ background: 'radial-gradient(circle at 50% 30%, rgba(0,210,211,0.06) 0%, transparent 70%)', border: '1px solid #1e1e1e' }}
                    >
                        <div className="absolute inset-0 rounded-3xl" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(0,210,211,0.1) 0%, transparent 60%)' }} />
                        <Phone size={36} className="text-gray-700 relative z-10" />
                    </div>
                    <p className="text-gray-500 font-medium mb-1">Enter a phone number to begin</p>
                    <p className="text-gray-700 text-sm max-w-sm">
                        Searches the complete call history — inbound and outbound — with no date restrictions.
                    </p>
                </div>
            )}

            <style>{`
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(8px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                @keyframes fadeInRow {
                    from { opacity: 0; }
                    to   { opacity: 1; }
                }
            `}</style>
        </div>
    );
};

interface SortableThProps {
    label: string;
    field: 'timestamp' | 'agentName' | 'duration';
    current: string;
    dir: 'asc' | 'desc';
    onSort: (f: 'timestamp' | 'agentName' | 'duration') => void;
    isRight?: boolean;
}
const SortableTh: React.FC<SortableThProps> = ({ label, field, current, dir, onSort, isRight }) => (
    <th
        className={`px-4 py-3 font-medium cursor-pointer select-none hover:text-white transition-colors text-gray-600 ${isRight ? 'text-right' : ''}`}
        onClick={() => onSort(field)}
    >
        <span className={`inline-flex items-center gap-1 ${isRight ? 'justify-end' : ''}`}>
            {label}
            <span className="text-[10px] opacity-60">
                {current === field ? (dir === 'asc' ? '↑' : '↓') : '⇅'}
            </span>
        </span>
    </th>
);
