import React, { useState, useEffect, useMemo } from 'react';
import { Search as SearchIcon, Hash, Loader2, RefreshCw, Filter, X } from 'lucide-react';
import { Evaluation } from '../services/api';
import { RangeSlider } from './RangeSlider';

interface EvaluationsSearchProps {
    onSearch: (filters: any) => void;
    isLoading: boolean;
    evaluations: Evaluation[];
    onFilterResults: (results: Evaluation[]) => void;
}

export const EvaluationsSearch: React.FC<EvaluationsSearchProps> = ({ onSearch, isLoading, evaluations, onFilterResults }) => {
    const [datePreset, setDatePreset] = useState('LAST_7_DAYS');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [interactionId, setInteractionId] = useState('');

    // Track the last searched parameters to determine if filters have changed
    const [lastSearchedParams, setLastSearchedParams] = useState<any>(null);
    const [isDirty, setIsDirty] = useState(false);

    // Client-side filters
    const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
    const [scoreRange, setScoreRange] = useState<[number, number]>([0, 100]);

    // Check if current filters differ from last search
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
        const params = {
            datePreset: datePreset === 'CUSTOM' ? undefined : datePreset,
            startDate: datePreset === 'CUSTOM' ? startDate : undefined,
            endDate: datePreset === 'CUSTOM' ? endDate : undefined,
            interactionId
        };

        setLastSearchedParams(params);
        onSearch(params);
    };

    // --- Dynamic Filtering Logic ---

    interface Facets {
        agentName: Set<string>;
        queue: Set<string>;
        direction: Set<string>;
        templateName: Set<string>;
    }

    // 1. Extract Facets from Evaluations (Dependent on Active Filters)
    const facets = useMemo<Facets>(() => {
        if (!evaluations.length) return { agentName: new Set(), queue: new Set(), direction: new Set(), templateName: new Set() };

        // Helper to check if an evaluation matches all active filters EXCEPT the one being generated
        const matchesFilters = (evaluation: Evaluation, excludeKey: string) => {
            for (const [key, value] of Object.entries(activeFilters)) {
                if (key === excludeKey) continue; // Skip the current filter key
                if (!value || value === 'all') continue;

                if ((evaluation as any)[key] !== value) return false;
            }
            // Also check score range
            if (evaluation.score < scoreRange[0] || evaluation.score > scoreRange[1]) return false;

            return true;
        };

        const options: Facets = {
            agentName: new Set<string>(),
            queue: new Set<string>(),
            direction: new Set<string>(),
            templateName: new Set<string>()
        };

        const keys: (keyof Facets)[] = ['agentName', 'queue', 'direction', 'templateName'];

        keys.forEach(key => {
            evaluations.forEach(evaluation => {
                if (!matchesFilters(evaluation, key)) return;
                const value = (evaluation as any)[key];
                if (value) options[key].add(value);
            });
        });

        return options;
    }, [evaluations, activeFilters, scoreRange]);

    // 2. Filter Evaluations based on Active Filters and Score Range
    useEffect(() => {
        if (!evaluations.length) {
            onFilterResults([]);
            return;
        }

        const filtered = evaluations.filter(evaluation => {
            // Check standard filters
            for (const [key, value] of Object.entries(activeFilters)) {
                if (!value || value === 'all') continue;
                if ((evaluation as any)[key] !== value) return false;
            }

            // Check score range
            if (evaluation.score < scoreRange[0] || evaluation.score > scoreRange[1]) return false;

            return true;
        });

        onFilterResults(filtered);
    }, [evaluations, activeFilters, scoreRange, onFilterResults]);

    const handleFilterChange = (key: string, value: string) => {
        setActiveFilters(prev => ({
            ...prev,
            [key]: value === 'all' ? '' : value
        }));
    };

    const clearFilters = () => {
        setActiveFilters({});
        setScoreRange([0, 100]);
    };

    const hasActiveFilters = Object.values(activeFilters).some(v => v) || scoreRange[0] > 0 || scoreRange[1] < 100;

    return (
        <div className="bg-[#1a1a1a] border-b border-[#333] p-4 flex flex-col gap-4">
            {/* Top Row: API Search Parameters */}
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

            {/* Bottom Row: Client-side Filters */}
            {evaluations.length > 0 && (
                <div className="pt-4 border-t border-[#333] flex flex-wrap gap-6 items-start">
                    <div className="flex items-center gap-2 text-sm text-gray-400 mr-2 mt-2">
                        <Filter size={16} />
                        <span>Filter Results:</span>
                    </div>

                    {/* Agent Name Filter */}
                    <div className="flex flex-col gap-1.5 min-w-[150px]">
                        <label className="text-xs font-medium text-gray-500 uppercase">Agent</label>
                        <select
                            value={activeFilters['agentName'] || ''}
                            onChange={(e) => handleFilterChange('agentName', e.target.value)}
                            className="bg-[#262626] border border-[#333] text-gray-200 text-sm rounded-md px-3 py-1.5 focus:outline-none focus:border-[#00d2d3]"
                        >
                            <option value="">All Agents</option>
                            {Array.from(facets.agentName).sort().map(agent => (
                                <option key={agent} value={agent}>{agent}</option>
                            ))}
                        </select>
                    </div>

                    {/* Queue Filter */}
                    <div className="flex flex-col gap-1.5 min-w-[150px]">
                        <label className="text-xs font-medium text-gray-500 uppercase">Queue</label>
                        <select
                            value={activeFilters['queue'] || ''}
                            onChange={(e) => handleFilterChange('queue', e.target.value)}
                            className="bg-[#262626] border border-[#333] text-gray-200 text-sm rounded-md px-3 py-1.5 focus:outline-none focus:border-[#00d2d3]"
                        >
                            <option value="">All Queues</option>
                            {Array.from(facets.queue).sort().map(queue => (
                                <option key={queue} value={queue}>{queue}</option>
                            ))}
                        </select>
                    </div>

                    {/* Direction Filter */}
                    <div className="flex flex-col gap-1.5 min-w-[120px]">
                        <label className="text-xs font-medium text-gray-500 uppercase">Direction</label>
                        <select
                            value={activeFilters['direction'] || ''}
                            onChange={(e) => handleFilterChange('direction', e.target.value)}
                            className="bg-[#262626] border border-[#333] text-gray-200 text-sm rounded-md px-3 py-1.5 focus:outline-none focus:border-[#00d2d3]"
                        >
                            <option value="">All</option>
                            {Array.from(facets.direction).sort().map(dir => (
                                <option key={dir} value={dir}>{dir}</option>
                            ))}
                        </select>
                    </div>

                    {/* Template Filter */}
                    <div className="flex flex-col gap-1.5 min-w-[150px]">
                        <label className="text-xs font-medium text-gray-500 uppercase">Template</label>
                        <select
                            value={activeFilters['templateName'] || ''}
                            onChange={(e) => handleFilterChange('templateName', e.target.value)}
                            className="bg-[#262626] border border-[#333] text-gray-200 text-sm rounded-md px-3 py-1.5 focus:outline-none focus:border-[#00d2d3]"
                        >
                            <option value="">All Templates</option>
                            {Array.from(facets.templateName).sort().map(tmpl => (
                                <option key={tmpl} value={tmpl}>{tmpl}</option>
                            ))}
                        </select>
                    </div>

                    {/* Score Range Slider */}
                    <div className="flex flex-col gap-1.5 min-w-[200px] flex-1 max-w-xs">
                        <label className="text-xs font-medium text-gray-500 uppercase flex justify-between">
                            <span>Score Range</span>
                            <span className="text-[#00d2d3] tabular-nums w-[100px] text-right">{scoreRange[0]} - {scoreRange[1]}%</span>
                        </label>
                        <div className="px-1 pt-2">
                            <RangeSlider
                                min={0}
                                max={100}
                                onChange={setScoreRange}
                                initialMin={0}
                                initialMax={100}
                            />
                        </div>
                    </div>

                    {/* Clear Filters Button */}
                    {hasActiveFilters && (
                        <button
                            onClick={clearFilters}
                            className="mt-6 text-xs text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors"
                        >
                            <X size={14} />
                            Clear Filters
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};
