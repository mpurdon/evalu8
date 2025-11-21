import React from 'react';
import { Settings, Phone, FileText } from 'lucide-react';

interface LayoutProps {
    children: React.ReactNode;
    activeTab: 'search' | 'settings' | 'evaluations';
    onTabChange: (tab: 'search' | 'settings' | 'evaluations') => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange }) => {
    return (
        <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans selection:bg-primary selection:text-primary-foreground">
            {/* Sidebar */}
            <div className="w-64 flex flex-col bg-card/50 backdrop-blur-xl border-r border-white/5">
                <div className="p-6 mb-2">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-black font-bold shadow-[0_0_15px_rgba(0,255,255,0.3)]">
                            E
                        </div>
                        <h1 className="text-xl font-bold tracking-tight">Evalu8</h1>
                    </div>
                </div>

                <nav className="flex-1 px-3 space-y-1">
                    <button
                        onClick={() => onTabChange('evaluations')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition-all duration-200 group ${activeTab === 'evaluations'
                            ? 'bg-white/10 text-white font-medium'
                            : 'text-muted-foreground hover:text-white hover:bg-white/5'
                            }`}
                    >
                        <FileText size={20} className={activeTab === 'evaluations' ? 'text-primary' : 'group-hover:text-white transition-colors'} />
                        <span>Evaluations</span>
                    </button>
                    <button
                        onClick={() => onTabChange('search')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition-all duration-200 group ${activeTab === 'search'
                            ? 'bg-white/10 text-white font-medium'
                            : 'text-muted-foreground hover:text-white hover:bg-white/5'
                            }`}
                    >
                        <Phone size={20} className={activeTab === 'search' ? 'text-primary' : 'group-hover:text-white transition-colors'} />
                        <span>Interactions</span>
                    </button>

                </nav>

                <div className="p-4 border-t border-white/5">
                    <button
                        onClick={() => onTabChange('settings')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition-all duration-200 group ${activeTab === 'settings'
                            ? 'bg-white/10 text-white font-medium'
                            : 'text-muted-foreground hover:text-white hover:bg-white/5'
                            }`}
                    >
                        <Settings size={20} className={activeTab === 'settings' ? 'text-primary' : 'group-hover:text-white transition-colors'} />
                        <span>Settings</span>
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <main className="flex-1 overflow-hidden flex flex-col bg-gradient-to-b from-background to-black">
                {children}
            </main>
        </div>
    );
};
