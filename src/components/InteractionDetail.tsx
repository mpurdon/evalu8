import React, { useEffect, useState } from 'react';
import { X, Play, SkipBack, SkipForward, Pause, Download, FileText, Clock, Calendar, Loader2 } from 'lucide-react';
import { Interaction, Evaluation, TranscriptSegment, getTranscript, getEvaluation, getAccessToken } from '../services/api';
import { format } from 'date-fns';

interface InteractionDetailProps {
    interaction: Interaction;
    evaluation: Evaluation | null;
    onClose: () => void;
}

export const InteractionDetail: React.FC<InteractionDetailProps> = ({ interaction, evaluation, onClose }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
    const [loadingTranscript, setLoadingTranscript] = useState(false);
    const [copiedId, setCopiedId] = useState(false);

    const [fullEvaluation, setFullEvaluation] = useState<Evaluation | null>(evaluation);

    useEffect(() => {
        const loadData = async () => {
            setLoadingTranscript(true);
            try {
                const apiKey = localStorage.getItem('apiKey') || '';
                const apiSecret = localStorage.getItem('apiSecret') || '';
                const region = localStorage.getItem('region') || 'us-west'; // Default to us-west as per recent fixes
                const config = { apiKey, apiSecret, region };

                // Fetch transcript
                const transcriptData = await getTranscript(config, interaction.interactionGuid);
                setTranscript(transcriptData);

                // Fetch full evaluation details if we don't have them or if we need to refresh
                // Even if 'evaluation' prop is passed, it might be the basic one from the list
                // We want the detailed one with sections
                const evalData = await getEvaluation(config, interaction.interactionGuid, evaluation?.id);
                if (evalData) {
                    setFullEvaluation(evalData);
                }

} catch (error) {
                console.error('Failed to load details:', error);
            } finally {
                setLoadingTranscript(false);
            }
        };

        loadData();
    }, [interaction.interactionGuid]);

    const handleDownloadTranscript = () => {
        if (transcript.length === 0) return;
        const content = transcript.map(t => `[${new Date(t.timestamp * 1000).toISOString().substr(11, 8)}] ${t.speaker}: ${t.text}`).join('\n');
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transcript-${interaction.interactionGuid}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleDownloadAudio = () => {
        // Construct the media URL based on the interaction GUID and region
        // This is a best-guess based on the API pattern, or we might need a specific endpoint
        // For now, we'll try to open the media URL we saw in the payload if available, or construct one
        const region = 'us-west';
        // Note: The actual media download might require a specific API call or token
        // For this implementation, we'll use the direct media link pattern if possible
        // or alert the user if we can't construct it easily without a signed URL
        const mediaUrl = `https://api.8x8.com/qm/${region}/v1/interactions/${interaction.interactionGuid}/media`;

        // Since we need auth headers, we can't just open it in a new tab easily for direct download
        // We'll fetch it as a blob and download
        const downloadMedia = async () => {
            try {
                const apiKey = localStorage.getItem('apiKey') || '';
                const apiSecret = localStorage.getItem('apiSecret') || '';
                const token = await getAccessToken({ apiKey, apiSecret, region });

                console.log(`Downloading audio from: ${mediaUrl}`);

                const response = await fetch(mediaUrl, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'pbx': 'trajectordisabili', // Hardcoded as requested
                        'Accept': 'audio/wav, audio/mpeg, application/octet-stream'
                    }
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Media download failed:', response.status, response.statusText, errorText);
                    throw new Error('Failed to fetch media');
                }

                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `recording-${interaction.interactionGuid}.wav`; // Assuming wav/mp3
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } catch (error) {
                console.error('Download failed:', error);
                alert('Failed to download recording. Please try again.');
            }
        };

        downloadMedia();
    };

    const handleDownloadEvaluation = () => {
        if (!fullEvaluation) return;
        const content = JSON.stringify(fullEvaluation, null, 2);
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `evaluation-${fullEvaluation.id}-${interaction.interactionGuid}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const audioRef = React.useRef<HTMLAudioElement>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    const [isAudioLoading, setIsAudioLoading] = useState(false);

    useEffect(() => {
        // Cleanup audio URL on unmount
        return () => {
            if (audioUrl) {
                URL.revokeObjectURL(audioUrl);
            }
        };
    }, [audioUrl]);

    const fetchAudio = async () => {
        if (audioUrl) return audioUrl;

        setIsAudioLoading(true);
        try {
            // Use us-west as default region to match searchInteractions
            const region = 'us-west';
            const mediaUrl = `https://api.8x8.com/qm/${region}/v1/interactions/${interaction.interactionGuid}/media`;
            const apiKey = localStorage.getItem('apiKey') || '';
            const apiSecret = localStorage.getItem('apiSecret') || '';

            // We still need to pass a region to getAccessToken, but it might not matter for the token itself
            // However, let's use the one that works for search
            const token = await getAccessToken({ apiKey, apiSecret, region });

            console.log(`Fetching audio from: ${mediaUrl}`);

            const response = await fetch(mediaUrl, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'pbx': 'trajectordisabili', // Hardcoded as requested, required for this tenant
                    'Accept': 'audio/wav, audio/mpeg, application/octet-stream'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Media fetch failed:', response.status, response.statusText, errorText);
                throw new Error(`Failed to fetch media: ${response.status} ${response.statusText}`);
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            setAudioUrl(url);
            return url;
        } catch (error) {
            console.error('Failed to load audio:', error);
            alert('Failed to load audio recording. Check console for details.');
            return null;
        } finally {
            setIsAudioLoading(false);
        }
    };

    const togglePlay = async () => {
        if (!audioRef.current) return;

        if (isPlaying) {
            audioRef.current.pause();
            setIsPlaying(false);
        } else {
            if (!audioUrl) {
                const url = await fetchAudio();
                if (!url) return;
                // Wait for state update and ref to be ready
                setTimeout(() => {
                    if (audioRef.current) {
                        audioRef.current.play();
                        setIsPlaying(true);
                    }
                }, 100);
            } else {
                audioRef.current.play();
                setIsPlaying(true);
            }
        }
    };

    const handleTimeUpdate = () => {
        if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
            setDuration(audioRef.current.duration || 0);
        }
    };

    const handleEnded = () => {
        setIsPlaying(false);
        setCurrentTime(0);
    };

    const formatTime = (time: number) => {
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const time = parseFloat(e.target.value);
        if (audioRef.current) {
            audioRef.current.currentTime = time;
            setCurrentTime(time);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-8">
            <div className="bg-[#1a1a1a] w-full max-w-6xl h-[85vh] rounded-2xl border border-[#333] flex flex-col overflow-hidden shadow-2xl relative">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-white z-10"
                >
                    <X size={24} />
                </button>

                {/* Header - Full Width */}
                <div className="p-6 border-b border-[#333] bg-[#262626] pr-12">
                    <div className="flex items-center gap-3 mb-2">
                        <h2 className="text-lg font-bold text-white group cursor-pointer flex items-center gap-2 whitespace-nowrap" onClick={() => {
                            navigator.clipboard.writeText(interaction.interactionGuid);
                            setCopiedId(true);
                            setTimeout(() => setCopiedId(false), 2000);
                        }}>
                            {interaction.interactionGuid}
                            <span className={`text-xs font-normal bg-[#333] px-2 py-1 rounded text-white transition-all ${copiedId ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                                }`}>
                                {copiedId ? 'Copied!' : 'Copy'}
                            </span>
                        </h2>
                    </div>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 text-gray-400 text-sm whitespace-nowrap">
                            <span className="font-medium text-white">{interaction.agentName}</span>
                            <span className="w-1 h-1 rounded-full bg-gray-600"></span>
                            <span className="flex items-center gap-1"><Calendar size={14} /> {format(new Date(interaction.timestamp), 'MMM d, yyyy HH:mm')}</span>
                            <span className="w-1 h-1 rounded-full bg-gray-600"></span>
                            <span className="flex items-center gap-1"><Clock size={14} /> {interaction.duration || '--:--'}</span>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handleDownloadTranscript}
                                disabled={transcript.length === 0}
                                className="px-3 py-1.5 bg-[#333] hover:bg-[#444] text-xs font-medium text-white rounded-md flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <FileText size={14} />
                                Download Transcript
                            </button>
                            <button
                                onClick={handleDownloadAudio}
                                className="px-3 py-1.5 bg-[#333] hover:bg-[#444] text-xs font-medium text-white rounded-md flex items-center gap-2 transition-colors"
                            >
                                <Download size={14} />
                                Download Audio
                            </button>
                        </div>
                    </div>
                </div>

                {/* Main Content Area - Split View */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Left Panel - Player & Transcript */}
                    <div className="w-2/3 flex flex-col border-r border-[#333]">
                        {/* Transcript */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#1a1a1a]">
                            {loadingTranscript ? (
                                <div className="flex flex-col items-center justify-center mt-20 gap-3 text-gray-500">
                                    <Loader2 className="w-8 h-8 animate-spin text-[#00d2d3]" />
                                    <p>Loading transcript...</p>
                                </div>
                            ) : transcript.length > 0 ? (
                                transcript.map((segment, idx) => (
                                    <div key={idx} className={`flex gap-4 ${segment.speaker === 'agent' ? 'flex-row-reverse' : ''}`}>
                                        <div className={`max-w-[80%] rounded-2xl p-4 ${segment.speaker === 'agent'
                                            ? 'bg-[#00d2d3]/10 text-[#00d2d3] rounded-tr-none'
                                            : 'bg-[#333] text-gray-200 rounded-tl-none'
                                            }`}>
                                            <div className="text-xs opacity-50 mb-1 capitalize">{segment.speaker} • {new Date(segment.timestamp * 1000).toISOString().substr(14, 5)}</div>
                                            <p className="leading-relaxed">{segment.text}</p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center text-gray-500 mt-10">No transcript available</div>
                            )}
                        </div>

                        {/* Player Controls */}
                        <div className="p-4 border-t border-[#333] bg-[#262626] flex items-center justify-between">
                            <audio
                                ref={audioRef}
                                src={audioUrl || undefined}
                                onTimeUpdate={handleTimeUpdate}
                                onEnded={handleEnded}
                                onLoadedMetadata={handleTimeUpdate}
                            />
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => {
                                        if (audioRef.current) audioRef.current.currentTime -= 10;
                                    }}
                                    className="text-gray-400 hover:text-white"
                                >
                                    <SkipBack size={20} />
                                </button>
                                <button
                                    onClick={togglePlay}
                                    disabled={isAudioLoading}
                                    className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isAudioLoading ? (
                                        <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                                    ) : isPlaying ? (
                                        <Pause size={24} fill="currentColor" />
                                    ) : (
                                        <Play size={24} fill="currentColor" className="ml-1" />
                                    )}
                                </button>
                                <button
                                    onClick={() => {
                                        if (audioRef.current) audioRef.current.currentTime += 10;
                                    }}
                                    className="text-gray-400 hover:text-white"
                                >
                                    <SkipForward size={20} />
                                </button>
                            </div>
                            <div className="flex-1 mx-6 flex items-center gap-3">
                                <span className="text-xs font-mono text-gray-400 w-10 text-right">{formatTime(currentTime)}</span>
                                <div className="flex-1 h-1 bg-[#333] rounded-full relative group">
                                    <div
                                        className="absolute top-0 left-0 h-full bg-[#00d2d3] rounded-full pointer-events-none"
                                        style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                                    ></div>
                                    <input
                                        type="range"
                                        min="0"
                                        max={duration || 0}
                                        value={currentTime}
                                        onChange={handleSeek}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    />
                                </div>
                                <span className="text-xs font-mono text-gray-400 w-10">{formatTime(duration)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Right Panel - Evaluation */}
                    <div className="w-1/3 bg-[#262626] flex flex-col border-l border-[#333]">
                        <div className="p-6 border-b border-[#333]">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <FileText size={20} className="text-[#00d2d3]" />
                                Evaluation Details
                            </h3>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                            {fullEvaluation ? (
                                <div className="space-y-6">
                                    <div className="bg-[#1a1a1a] rounded-xl p-6 border border-[#333]">
                                        <div className="text-sm text-gray-400 mb-1">Total Score</div>
                                        <div className={`text-4xl font-bold ${fullEvaluation.score >= 90 ? 'text-green-400' :
                                            fullEvaluation.score >= 75 ? 'text-yellow-400' : 'text-red-400'
                                            }`}>
                                            {fullEvaluation.score}%
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div>
                                            <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Template</div>
                                            <div className="text-white font-medium">{fullEvaluation.templateName}</div>
                                        </div>
                                        <div>
                                            <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Evaluator</div>
                                            <div className="text-white font-medium">{fullEvaluation.evaluator || 'System'}</div>
                                        </div>
                                        <div>
                                            <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Evaluation Date</div>
                                            <div className="text-white font-medium">{format(new Date(fullEvaluation.timestamp), 'MMM d, yyyy HH:mm')}</div>
                                        </div>
                                    </div>

                                    {/* Detailed Sections */}
                                    {fullEvaluation.sections && fullEvaluation.sections.length > 0 && (
                                        <div className="mt-6 space-y-6">
                                            {fullEvaluation.sections.map((section: any, sIdx: number) => (
                                                <div key={sIdx} className="border-t border-[#333] pt-4">
                                                    <h4 className="text-sm font-bold text-[#00d2d3] mb-3">{section.name}</h4>
                                                    <div className="space-y-3">
                                                        {section.questions?.map((question: any, qIdx: number) => (
                                                            <div key={qIdx} className="bg-[#1a1a1a] p-3 rounded-lg border border-[#333]">
                                                                <div className="text-sm text-gray-200 mb-2">{question.text}</div>
                                                                <div className="flex justify-between items-center">
                                                                    <span className={`text-xs px-2 py-1 rounded ${question.score > 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                                                                        }`}>
                                                                        {question.answer || 'N/A'}
                                                                    </span>
                                                                    <span className="text-xs text-gray-500">{question.score}/{question.maxScore}</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <button
                                        onClick={handleDownloadEvaluation}
                                        className="w-full bg-[#333] hover:bg-[#444] text-white py-3 rounded-lg flex items-center justify-center gap-2 transition-colors mt-8"
                                    >
                                        <Download size={18} />
                                        Download Report
                                    </button>
                                </div>
                            ) : (
                                <div className="text-center text-gray-500 mt-10">
                                    <p>No evaluation found for this interaction.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
