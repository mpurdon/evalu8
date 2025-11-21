import React, { useState, useEffect, useMemo } from 'react';
import { Search as SearchIcon, Hash, Loader2, RefreshCw, Filter, X } from 'lucide-react';
import { Interaction } from '../services/api';

interface SearchProps {
    onSearch: (filters: any) => void;
    isLoading: boolean;
    interactions: Interaction[];
    onFilterResults: (results: Interaction[]) => void;
}

export const Search: React.FC<SearchProps> = ({ onSearch, isLoading, interactions, onFilterResults }) => {
    // API Search State
    const [datePreset, setDatePreset] = useState('LAST_7_DAYS');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [interactionId, setInteractionId] = useState('');

    // Dynamic Filter State
    const [activeFilters, setActiveFilters] = useState<Record<string, any>>({});

    // Track the last searched parameters
    const [lastSearchedParams, setLastSearchedParams] = useState<any>(null);
    const [isDirty, setIsDirty] = useState(false);

    // Check if current API filters differ from last search
    useEffect(() => {
        if (!lastSearchedParams) {
            setIsDirty(false);
            return;
        }

        const currentParams = {
            datePreset: datePreset === 'CUSTOM' ? undefined : datePreset,
            startDate: datePreset === 'CUSTOM' ? startDate : undefined,
            endDate: datePreset === 'CUSTOM' ? endDate : undefined,
            interactionId
        };

        const dirty = JSON.stringify(currentParams) !== JSON.stringify(lastSearchedParams);
        setIsDirty(dirty);
    }, [datePreset, startDate, endDate, interactionId, lastSearchedParams]);

    const handleSearch = () => {
        let start = startDate;
        let end = endDate;

        if (datePreset !== 'CUSTOM') {
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

            switch (datePreset) {
                case 'TODAY':
                    start = today.toISOString();
                    end = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString();
                    break;
                case 'YESTERDAY':
                    const yesterday = new Date(today);
                    yesterday.setDate(yesterday.getDate() - 1);
                    start = yesterday.toISOString();
                    end = new Date(yesterday.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString();
                    break;
                case 'LAST_7_DAYS':
                    start = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
                    end = now.toISOString();
                    break;
                case 'LAST_30_DAYS':
                    start = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
                    end = now.toISOString();
                    break;
                case 'THIS_WEEK':
                    const firstDayOfWeek = new Date(today);
                    const day = today.getDay(); // 0 (Sun) to 6 (Sat)
                    const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
                    firstDayOfWeek.setDate(diff);
                    start = firstDayOfWeek.toISOString();
                    end = now.toISOString();
                    break;
                case 'LAST_WEEK':
                    const lastWeekStart = new Date(today);
                    const currentDay = today.getDay();
                    const diffLast = today.getDate() - currentDay + (currentDay === 0 ? -6 : 1) - 7;
                    lastWeekStart.setDate(diffLast);
                    const lastWeekEnd = new Date(lastWeekStart);
                    lastWeekEnd.setDate(lastWeekStart.getDate() + 6);
                    lastWeekEnd.setHours(23, 59, 59, 999);

                    start = lastWeekStart.toISOString();
                    end = lastWeekEnd.toISOString();
                    break;
                case 'THIS_MONTH':
                    start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
                    end = now.toISOString();
                    break;
                case 'LAST_MONTH':
                    start = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString();
                    end = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999).toISOString();
                    break;
            }
        }

        const params = {
            datePreset,
            startDate: start,
            endDate: end,
            interactionId
        };

        setLastSearchedParams(params);
        onSearch(params);
        setActiveFilters({}); // Reset dynamic filters on new search
    };

    // --- Dynamic Filtering Logic ---

    // 1. Extract Facets from Interactions (Dependent on Active Filters)
    const facets = useMemo(() => {
        if (!interactions.length) return { standard: {}, custom: {} };

        // Helper to check if an interaction matches all active filters EXCEPT the one being generated
        const matchesFilters = (interaction: Interaction, excludeKey: string) => {
            for (const [key, value] of Object.entries(activeFilters)) {
                if (key === excludeKey) continue; // Skip the current filter key
                if (!value || value === 'all') continue;

                if (key.startsWith('custom:')) {
                    const fieldName = key.replace('custom:', '');
                    const field = Object.values(interaction.customFields || {}).find(f => f.displayName === fieldName);
                    if (!field || field.value !== value) return false;
                } else {
                    const parts = key.split('.');
                    let current: any = interaction;
                    for (const part of parts) {
                        current = current?.[part];
                    }
                    if (current !== value) return false;
                }
            }
            return true;
        };

        // Define standard keys we want to filter by
        const standardKeys = ['telephony.direction', 'telephony.callerName', 'speechAnalysis.overallEmotion'];

        // Identify all custom keys present in the dataset
        const customKeys = new Set<string>();
        interactions.forEach(interaction => {
            if (interaction.customFields) {
                Object.values(interaction.customFields).forEach(field => {
                    if (field.value && field.displayName && field.displayName.toLowerCase().includes('name')) {
                        customKeys.add(field.displayName);
                    }
                });
            }
        });

        // Generate options for Standard Keys
        const standardOptions: Record<string, Set<string>> = {};
        standardKeys.forEach(key => {
            standardOptions[key] = new Set();

            interactions.forEach(interaction => {
                if (!matchesFilters(interaction, key)) return;

                // Extract value
                let value: any = undefined;
                if (key === 'telephony.direction') value = interaction.telephony?.direction;
                else if (key === 'telephony.callerName') {
                    const name = interaction.telephony?.callerName;
                    if (name) {
                        const startsWithNumber = /^(\+|)\d/.test(name);
                        if (!startsWithNumber) value = name;
                    }
                }
                else if (key === 'speechAnalysis.overallEmotion') value = interaction.speechAnalysis?.overallEmotion;

                if (value) standardOptions[key].add(value);
            });
        });

        // Generate options for Custom Keys
        const customFieldOptions: Record<string, Set<string>> = {};
        customKeys.forEach(displayName => {
            const filterKey = `custom:${displayName}`;
            customFieldOptions[displayName] = new Set();

            interactions.forEach(interaction => {
                if (!matchesFilters(interaction, filterKey)) return;

                const field = Object.values(interaction.customFields || {}).find(f => f.displayName === displayName);
                if (field && field.value) {
                    customFieldOptions[displayName].add(field.value);
                }
            });
        });

        return {
            standard: standardOptions,
            custom: customFieldOptions
        };
    }, [interactions, activeFilters]);

    // 2. Filter Interactions based on Active Filters
    useEffect(() => {
        if (!interactions.length) {
            onFilterResults([]);
            return;
        }

        const filtered = interactions.filter(interaction => {
            // Check Standard Filters
            for (const [key, value] of Object.entries(activeFilters)) {
                if (!value || value === 'all') continue;

                if (key.startsWith('custom:')) {
                    // Custom Field Filter
                    const fieldName = key.replace('custom:', '');
                    const field = Object.values(interaction.customFields || {}).find(f => f.displayName === fieldName);
                    if (!field || field.value !== value) return false;
                } else if (key === 'media.interactionDuration') {
                    // Duration Filter (Min-Max) - value is { min, max }
                    // Not implemented as a range yet, assuming exact match or skipping for now as per complexity
                    // Let's skip duration for now or implement if requested specifically as a range
                } else {
                    // Standard Field Filter (nested)
                    const parts = key.split('.');
                    let current: any = interaction;
                    for (const part of parts) {
                        current = current?.[part];
                    }
                    if (current !== value) return false;
                }
            }
            return true;
        });

        onFilterResults(filtered);
    }, [interactions, activeFilters, onFilterResults]);

    const updateFilter = (key: string, value: string) => {
        setActiveFilters(prev => ({
            ...prev,
            [key]: value === 'all' ? undefined : value
        }));
    };

    return (
        <div className="bg-[#1a1a1a] border-b border-[#333] p-4 space-y-4">
            {/* Main API Filters */}
            <div className="flex flex-wrap gap-4 items-end">
                {/* Date Range Filter */}
                <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Date Range</label>
                    <div className="flex gap-2">
                        <select
                            value={datePreset}
                            onChange={(e) => setDatePreset(e.target.value)}
                            className="bg-[#262626] border border-[#333] text-gray-200 text-sm rounded-md px-3 py-2 focus:outline-none focus:border-[#00d2d3] transition-colors"
                        >
                            <option value="TODAY">Today</option>
                            <option value="YESTERDAY">Yesterday</option>
                            <option value="LAST_7_DAYS">Last 7 Days</option>
                            <option value="LAST_30_DAYS">Last 30 Days</option>
                            <option value="THIS_WEEK">This Week</option>
                            <option value="LAST_WEEK">Last Week</option>
                            <option value="THIS_MONTH">This Month</option>
                            <option value="LAST_MONTH">Last Month</option>
                            <option value="CUSTOM">Custom Range</option>
                        </select>

                        {datePreset === 'CUSTOM' && (
                            <>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="bg-[#262626] border border-[#333] text-gray-200 text-sm rounded-md px-3 py-2 focus:outline-none focus:border-[#00d2d3] transition-colors"
                                />
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="bg-[#262626] border border-[#333] text-gray-200 text-sm rounded-md px-3 py-2 focus:outline-none focus:border-[#00d2d3] transition-colors"
                                />
                            </>
                        )}
                    </div>
                </div>

                {/* Interaction ID Filter */}
                <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Interaction ID</label>
                    <div className="relative">
                        <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input
                            type="text"
                            value={interactionId}
                            onChange={(e) => setInteractionId(e.target.value)}
                            placeholder="Search ID..."
                            className="bg-[#262626] border border-[#333] text-gray-200 text-sm rounded-md pl-9 pr-3 py-2 w-40 focus:outline-none focus:border-[#00d2d3] transition-colors placeholder:text-gray-600"
                        />
                    </div>
                </div>

                {/* Search Button */}
                <button
                    onClick={handleSearch}
                    disabled={isLoading}
                    className={`
                        ${isDirty
                            ? 'bg-amber-500 hover:bg-amber-600 animate-pulse'
                            : 'bg-[#00d2d3] hover:bg-[#00b5b6]'
                        }
                        text-black font-medium px-6 py-2 rounded-md flex items-center gap-2 transition-all ml-auto
                        disabled:opacity-50 disabled:cursor-not-allowed
                    `}
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Searching...
                        </>
                    ) : isDirty ? (
                        <>
                            <RefreshCw className="w-4 h-4" />
                            Refresh
                        </>
                    ) : (
                        <>
                            <SearchIcon className="w-4 h-4" />
                            Search
                        </>
                    )}
                </button>
            </div>

            {/* Dynamic Filters Section */}
            {interactions.length > 0 && (
                <div className="pt-4 border-t border-[#333]">
                    <div className="flex items-center gap-2 mb-3 text-gray-400 text-sm">
                        <Filter size={14} />
                        <span className="font-medium uppercase tracking-wider text-xs">Result Filters</span>
                        {Object.keys(activeFilters).length > 0 && (
                            <button
                                onClick={() => setActiveFilters({})}
                                className="ml-auto text-xs text-[#00d2d3] hover:underline flex items-center gap-1"
                            >
                                <X size={12} /> Clear Filters
                            </button>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-3">
                        {/* Standard Facets */}
                        {Object.entries(facets.standard).map(([key, values]) => {
                            if (values.size === 0) return null;
                            const label = key.split('.')[1].replace(/([A-Z])/g, ' $1').trim(); // CamelCase to Title Case
                            return (
                                <div key={key} className="flex flex-col gap-1">
                                    <label className="text-[10px] font-medium text-gray-500 uppercase">{label}</label>
                                    <select
                                        value={activeFilters[key] || 'all'}
                                        onChange={(e) => updateFilter(key, e.target.value)}
                                        className="bg-[#262626] border border-[#333] text-gray-300 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-[#00d2d3] min-w-[120px] max-w-[200px]"
                                    >
                                        <option value="all">All</option>
                                        {Array.from(values).sort().map((v: any) => (
                                            <option key={v} value={v}>{v}</option>
                                        ))}
                                    </select>
                                </div>
                            );
                        })}

                        {/* Custom Field Facets */}
                        {Object.entries(facets.custom).map(([displayName, values]) => {
                            if (values.size === 0) return null;
                            return (
                                <div key={displayName} className="flex flex-col gap-1">
                                    <label className="text-[10px] font-medium text-gray-500 uppercase">{displayName}</label>
                                    <select
                                        value={activeFilters[`custom:${displayName}`] || 'all'}
                                        onChange={(e) => updateFilter(`custom:${displayName}`, e.target.value)}
                                        className="bg-[#262626] border border-[#333] text-gray-300 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-[#00d2d3] min-w-[120px] max-w-[200px]"
                                    >
                                        <option value="all">All</option>
                                        {Array.from(values).sort().map((v: any) => (
                                            <option key={v} value={v}>{v}</option>
                                        ))}
                                    </select>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};
