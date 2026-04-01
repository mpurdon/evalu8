import { useState } from 'react';
import { Layout, Tab } from './components/Layout';
import { Settings } from './components/Settings';
import { Search } from './components/Search';
import { ResultsTable } from './components/ResultsTable';
import { InteractionDetail } from './components/InteractionDetail';
import { EvaluationsView } from './components/EvaluationsView';
import { PhoneSearch } from './components/PhoneSearch';
import { searchInteractions, getEvaluation, Evaluation, Interaction } from './services/api';
import { AlertCircle, Copy, Check } from 'lucide-react';

function App() {
    const [activeTab, setActiveTab] = useState<Tab>('search');
    const [interactions, setInteractions] = useState<Interaction[]>([]);
    const [filteredInteractions, setFilteredInteractions] = useState<Interaction[]>([]);
    const [selectedInteraction, setSelectedInteraction] = useState<Interaction | null>(null);
    const [selectedEvaluation, setSelectedEvaluation] = useState<Evaluation | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const [progressCount, setProgressCount] = useState(0);
    const [totalCount, setTotalCount] = useState(0);

    const handleSearch = async (filters: any) => {
        setIsLoading(true);
        setError(null);
        setProgressCount(0);
        setTotalCount(0);
        try {
            const apiKey = localStorage.getItem('apiKey') || '';
            const apiSecret = localStorage.getItem('apiSecret') || '';
            const region = localStorage.getItem('region') || 'us-west-stats';

            if (!apiKey || !apiSecret) {
                alert('Please configure your API credentials in Settings');
                return;
            }

            const results = await searchInteractions(
                { apiKey, apiSecret, region },
                filters,
                ({ scanned, totalWindows }) => {
                    setProgressCount(scanned);
                    if (totalWindows) setTotalCount(totalWindows);
                }
            );
            setInteractions(results);
            setFilteredInteractions(results); // Initialize filtered with all results
        } catch (err: any) {
            console.error('Search failed:', err);
            let errorMessage = err.message;
            try {
                // Try to parse JSON error from API service
                const parsed = JSON.parse(err.message);
                errorMessage = JSON.stringify(parsed, null, 2);
            } catch (e) {
                // Not JSON, keep original message
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

    const handleSelectInteraction = async (interaction: Interaction) => {
        setSelectedInteraction(interaction);
        // Fetch evaluation details
        try {
            const apiKey = localStorage.getItem('apiKey') || '';
            const apiSecret = localStorage.getItem('apiSecret') || '';
            const region = localStorage.getItem('region') || 'us-east-1';

            const evaluation = await getEvaluation({ apiKey, apiSecret, region }, interaction.interactionGuid);
            setSelectedEvaluation(evaluation);
        } catch (error) {
            console.error('Failed to fetch evaluation:', error);
            setSelectedEvaluation(null);
        }
    };

    const handleSelectEvaluation = async (evaluation: Evaluation) => {
        setSelectedEvaluation(evaluation);
        // We need to construct a minimal interaction object or fetch it
        // For now, we'll construct it from the evaluation data as best as we can
        // Ideally, we should fetch the full interaction details if possible
        const interaction: Interaction = {
            id: evaluation.interactionGuid,
            interactionGuid: evaluation.interactionGuid,
            agentName: evaluation.agentName,
            timestamp: evaluation.timestamp,
            queue: evaluation.queue,
            direction: evaluation.direction,
            duration: '' // We might not have this in the evaluation object
        };
        setSelectedInteraction(interaction);
    };

    return (
        <Layout activeTab={activeTab} onTabChange={setActiveTab}>
            {/* Settings Tab */}
            <div style={{ display: activeTab === 'settings' ? 'block' : 'none', height: '100%' }}>
                <Settings onSave={() => setActiveTab('search')} />
            </div>

            {/* Evaluations Tab */}
            <div style={{ display: activeTab === 'evaluations' ? 'block' : 'none', height: '100%' }}>
                <EvaluationsView onSelectEvaluation={handleSelectEvaluation} />
            </div>

            {/* Phone Lookup Tab */}
            <div style={{ display: activeTab === 'phone' ? 'flex' : 'none', height: '100%', flexDirection: 'column' }}>
                <PhoneSearch onSelectInteraction={handleSelectInteraction} />
            </div>

            {/* Interactions Search Tab */}
            <div style={{ display: activeTab === 'search' ? 'flex' : 'none', height: '100%', flexDirection: 'column' }}>
                <div className="p-6 pb-0">
                    <div className="flex items-center gap-3 mb-2">
                        <h2 className="text-3xl font-bold">Search Interactions</h2>
                        <span className="px-2 py-1 rounded-full bg-white/10 text-xs font-medium text-muted-foreground border border-white/10">
                            {localStorage.getItem('region')?.includes('stats') ? 'Stats API' : 'Rocket API'}
                        </span>
                    </div>
                    <p className="text-muted-foreground mb-6">Find and review calls, transcripts, and evaluations.</p>
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

                <Search
                    onSearch={handleSearch}
                    isLoading={isLoading}
                    interactions={interactions}
                    onFilterResults={setFilteredInteractions}
                />

                {isLoading && (
                    <div className="px-6 py-2 bg-[#1a1a1a] border-b border-[#333]">
                        <div className="flex items-center gap-3 text-sm text-[#00d2d3]">
                            <div className="w-4 h-4 border-2 border-[#00d2d3] border-t-transparent rounded-full animate-spin" />
                            <span>Fetching interactions... ({progressCount} {totalCount > 0 ? `/ ${totalCount}` : ''} loaded)</span>
                        </div>
                        <div className="mt-2 h-1 bg-[#333] rounded-full overflow-hidden">
                            <div
                                className="h-full bg-[#00d2d3] transition-all duration-300 ease-out"
                                style={{ width: totalCount > 0 ? `${Math.min((progressCount / totalCount) * 100, 100)}%` : '100%' }}
                            />
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-auto">
                    <ResultsTable
                        interactions={filteredInteractions}
                        onSelectInteraction={handleSelectInteraction}
                    />
                </div>
            </div>

            {selectedInteraction && (
                <InteractionDetail
                    interaction={selectedInteraction}
                    evaluation={selectedEvaluation}
                    onClose={() => {
                        setSelectedInteraction(null);
                        setSelectedEvaluation(null);
                    }}
                />
            )}
        </Layout>
    );
}

export default App;
