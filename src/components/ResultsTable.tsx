import React, { useState } from 'react';
import { Interaction } from '../services/api';
import { Play, Clock, ArrowUpRight, ArrowDownLeft, ChevronUp, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';

interface ResultsTableProps {
    interactions: Interaction[];
    onSelectInteraction: (interaction: Interaction) => void;
}

type SortField = 'agentName' | 'timestamp' | 'duration';
type SortDirection = 'asc' | 'desc';

export const ResultsTable: React.FC<ResultsTableProps> = ({ interactions, onSelectInteraction }) => {
    const [sortField, setSortField] = useState<SortField>('timestamp');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;

    // Reset to first page when interactions change
    React.useEffect(() => {
        setCurrentPage(1);
    }, [interactions]);

    const sortedInteractions = [...interactions].sort((a, b) => {
        let aValue: any = a[sortField];
        let bValue: any = b[sortField];

        if (sortField === 'duration') {
            // Convert MM:SS to seconds for comparison
            const toSeconds = (dur?: string) => {
                if (!dur) return 0;
                const [m, s] = dur.split(':').map(Number);
                return m * 60 + s;
            };
            aValue = toSeconds(a.duration);
            bValue = toSeconds(b.duration);
        } else if (sortField === 'timestamp') {
            aValue = new Date(a.timestamp).getTime();
            bValue = new Date(b.timestamp).getTime();
        } else {
            // String comparison for agentName
            aValue = (aValue || '').toLowerCase();
            bValue = (bValue || '').toLowerCase();
        }

        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    // Pagination Logic
    const totalPages = Math.ceil(sortedInteractions.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedInteractions = sortedInteractions.slice(startIndex, startIndex + itemsPerPage);

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <div className="w-4 h-4" />; // Placeholder
        return sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />;
    };

    if (interactions.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                <p className="text-lg font-medium">No interactions found</p>
                <p className="text-sm">Try adjusting your search filters</p>
            </div>
        );
    }

    return (
        <div className="w-full flex flex-col h-full">
            <div className="flex-1 overflow-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-[#333] text-gray-400 text-xs uppercase tracking-wider sticky top-0 bg-[#1a1a1a] z-10">
                            <th className="p-4 font-medium w-12">#</th>
                            <th
                                className="p-4 font-medium cursor-pointer hover:text-white transition-colors select-none"
                                onClick={() => handleSort('agentName')}
                            >
                                <div className="flex items-center gap-1">
                                    Agent <SortIcon field="agentName" />
                                </div>
                            </th>

                            <th
                                className="p-4 font-medium cursor-pointer hover:text-white transition-colors select-none"
                                onClick={() => handleSort('timestamp')}
                            >
                                <div className="flex items-center gap-1">
                                    Date <SortIcon field="timestamp" />
                                </div>
                            </th>
                            <th className="p-4 font-medium">Queue</th>
                            <th className="p-4 font-medium">Direction</th>
                            <th
                                className="p-4 font-medium text-right cursor-pointer hover:text-white transition-colors select-none"
                                onClick={() => handleSort('duration')}
                            >
                                <div className="flex items-center justify-end gap-1">
                                    <Clock className="w-4 h-4" /> <SortIcon field="duration" />
                                </div>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedInteractions.map((interaction, index) => (
                            <tr
                                key={interaction.id}
                                onClick={() => onSelectInteraction(interaction)}
                                className="group hover:bg-[#262626] transition-colors cursor-pointer border-b border-[#333]/50 last:border-0"
                            >
                                <td className="p-4 text-gray-500 text-sm group-hover:text-white">
                                    <span className="group-hover:hidden">{startIndex + index + 1}</span>
                                    <Play className="w-4 h-4 hidden group-hover:block text-[#00d2d3]" />
                                </td>
                                <td className="p-4 text-white font-medium">
                                    {interaction.agentName}
                                </td>

                                <td className="p-4 text-gray-400 text-sm">
                                    {format(new Date(interaction.timestamp), 'MMM d, yyyy HH:mm')}
                                </td>
                                <td className="p-4 text-gray-400 text-sm">
                                    {interaction.queue}
                                </td>
                                <td className="p-4 text-gray-400 text-sm">
                                    <div className="flex items-center gap-2">
                                        {interaction.direction === 'inbound' ? (
                                            <ArrowDownLeft className="w-4 h-4 text-green-400" />
                                        ) : (
                                            <ArrowUpRight className="w-4 h-4 text-blue-400" />
                                        )}
                                        <span className="capitalize">{interaction.direction}</span>
                                    </div>
                                </td>
                                <td className="p-4 text-gray-400 text-sm text-right font-mono">
                                    {interaction.duration || '--:--'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-[#333] bg-[#1a1a1a]">
                    <div className="text-xs text-gray-400">
                        Showing <span className="font-medium text-white">{startIndex + 1}</span> to <span className="font-medium text-white">{Math.min(startIndex + itemsPerPage, sortedInteractions.length)}</span> of <span className="font-medium text-white">{sortedInteractions.length}</span> results
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="px-3 py-1 text-xs font-medium text-gray-300 bg-[#262626] rounded hover:bg-[#333] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            Previous
                        </button>
                        <span className="text-xs text-gray-400">
                            Page <span className="text-white">{currentPage}</span> of {totalPages}
                        </span>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="px-3 py-1 text-xs font-medium text-gray-300 bg-[#262626] rounded hover:bg-[#333] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
