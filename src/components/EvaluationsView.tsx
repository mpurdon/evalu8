import React, { useState } from 'react';
import { EvaluationsSearch } from './EvaluationsSearch';
import { EvaluationsTable } from './EvaluationsTable';
import { searchEvaluations, Evaluation } from '../services/api';
import { AlertCircle, Copy, Check } from 'lucide-react';

interface EvaluationsViewProps {
    onSelectEvaluation?: (evaluation: Evaluation) => void;
}

export const EvaluationsView: React.FC<EvaluationsViewProps> = ({ onSelectEvaluation }) => {
    const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
    const [filteredEvaluations, setFilteredEvaluations] = useState<Evaluation[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const handleSearch = async (filters: any) => {
        setIsLoading(true);
        setError(null);
        try {
            const apiKey = localStorage.getItem('apiKey') || '';
            const apiSecret = localStorage.getItem('apiSecret') || '';
            const region = localStorage.getItem('region') || 'us-west-stats';

            if (!apiKey || !apiSecret) {
                alert('Please configure your API credentials in Settings');
                return;
            }

            const results = await searchEvaluations({ apiKey, apiSecret, region }, filters);
            setEvaluations(results);
            setFilteredEvaluations(results);
        } catch (err: any) {
            console.error('Search failed:', err);
            let errorMessage = err.message;
            try {
                const parsed = JSON.parse(err.message);
                errorMessage = JSON.stringify(parsed, null, 2);
            } catch (e) {
                // Not JSON
            }
            setError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    const copyError = () => {
        if (error) {
            navigator.clipboard.writeText(error);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleSelectEvaluation = (evaluation: Evaluation) => {
        if (onSelectEvaluation) {
            onSelectEvaluation(evaluation);
        }
    };

    return (
        <div className="h-full flex flex-col">
            <div className="p-6 pb-0">
                <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-3xl font-bold">Evaluations</h2>
                    <span className="px-2 py-1 rounded-full bg-white/10 text-xs font-medium text-muted-foreground border border-white/10">
                        {localStorage.getItem('region')?.includes('stats') ? 'Stats API' : 'Rocket API'}
                    </span>
                </div>
                <p className="text-muted-foreground mb-6">Search and review agent evaluations.</p>
            </div>

            {error && (
                <div className="mx-6 mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-4">
                    <AlertCircle className="text-red-500 shrink-0 mt-1" size={20} />
                    <div className="flex-1 overflow-hidden">
                        <h3 className="text-red-500 font-bold mb-1">Search Failed</h3>
                        <pre className="text-red-400 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all">
                            {error}
                        </pre>
                    </div>
                    <button
                        onClick={copyError}
                        className="text-red-400 hover:text-red-300 p-2 hover:bg-red-500/10 rounded transition-colors"
                        title="Copy Error Details"
                    >
                        {copied ? <Check size={18} /> : <Copy size={18} />}
                    </button>
                </div>
            )}

            <EvaluationsSearch
                onSearch={handleSearch}
                isLoading={isLoading}
                evaluations={evaluations}
                onFilterResults={setFilteredEvaluations}
            />

            <div className="flex-1 overflow-auto">
                <EvaluationsTable
                    evaluations={filteredEvaluations}
                    onSelectEvaluation={handleSelectEvaluation}
                />
            </div>
        </div>
    );
};
