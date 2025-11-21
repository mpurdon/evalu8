import React, { useState, useMemo } from 'react';
import { Evaluation } from '../services/api';
import { FileText, User, Calendar, Hash, Percent, ArrowUp, ArrowDown } from 'lucide-react';

interface EvaluationsTableProps {
    evaluations: Evaluation[];
    onSelectEvaluation: (evaluation: Evaluation) => void;
}

type SortField = 'timestamp' | 'score' | 'agentName' | 'templateName' | 'interactionGuid';
type SortDirection = 'asc' | 'desc';

export const EvaluationsTable: React.FC<EvaluationsTableProps> = ({ evaluations, onSelectEvaluation }) => {
    const [sortField, setSortField] = useState<SortField>('timestamp');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc'); // Default to desc for new field
        }
    };

    const sortedEvaluations = useMemo(() => {
        return [...evaluations].sort((a, b) => {
            let aValue: any = a[sortField];
            let bValue: any = b[sortField];

            if (sortField === 'timestamp') {
                aValue = new Date(a.timestamp).getTime();
                bValue = new Date(b.timestamp).getTime();
            }

            if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }, [evaluations, sortField, sortDirection]);

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return null;
        return sortDirection === 'asc' ? <ArrowUp size={14} className="ml-1" /> : <ArrowDown size={14} className="ml-1" />;
    };

    if (evaluations.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <FileText size={48} className="mb-4 opacity-20" />
                <p className="text-lg font-medium">No evaluations found</p>
                <p className="text-sm">Try adjusting your search filters</p>
            </div>
        );
    }

    return (
        <div className="w-full">
            <table className="w-full text-left border-collapse">
                <thead className="bg-[#1a1a1a] sticky top-0 z-10">
                    <tr>
                        <th
                            className="p-4 text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-[#333] cursor-pointer hover:text-white transition-colors"
                            onClick={() => handleSort('timestamp')}
                        >
                            <div className="flex items-center">
                                Date <SortIcon field="timestamp" />
                            </div>
                        </th>
                        <th
                            className="p-4 text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-[#333] cursor-pointer hover:text-white transition-colors"
                            onClick={() => handleSort('agentName')}
                        >
                            <div className="flex items-center">
                                Agent <SortIcon field="agentName" />
                            </div>
                        </th>
                        <th
                            className="p-4 text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-[#333] cursor-pointer hover:text-white transition-colors"
                            onClick={() => handleSort('templateName')}
                        >
                            <div className="flex items-center">
                                Template <SortIcon field="templateName" />
                            </div>
                        </th>
                        <th
                            className="p-4 text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-[#333] cursor-pointer hover:text-white transition-colors"
                            onClick={() => handleSort('score')}
                        >
                            <div className="flex items-center">
                                Score <SortIcon field="score" />
                            </div>
                        </th>

                    </tr>
                </thead>
                <tbody className="divide-y divide-[#333]">
                    {sortedEvaluations.map((evaluation) => (
                        <tr
                            key={evaluation.id}
                            onClick={() => onSelectEvaluation(evaluation)}
                            className="hover:bg-white/5 cursor-pointer transition-colors group"
                        >
                            <td className="p-4">
                                <div className="flex items-center gap-2 text-gray-300">
                                    <Calendar size={14} className="text-gray-500" />
                                    {new Date(evaluation.timestamp).toLocaleString()}
                                </div>
                            </td>
                            <td className="p-4">
                                <div className="flex items-center gap-2 text-gray-300">
                                    <User size={14} className="text-gray-500" />
                                    {evaluation.agentName}
                                </div>
                            </td>
                            <td className="p-4">
                                <div className="flex items-center gap-2 text-gray-300">
                                    <FileText size={14} className="text-gray-500" />
                                    {evaluation.templateName}
                                </div>
                            </td>
                            <td className="p-4">
                                <div className="flex items-center gap-2">
                                    <Percent size={14} className="text-gray-500" />
                                    <span className={`font-medium ${evaluation.score >= 90 ? 'text-green-400' : evaluation.score >= 70 ? 'text-yellow-400' : 'text-red-400'}`}>
                                        {evaluation.score}%
                                    </span>
                                </div>
                            </td>

                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
