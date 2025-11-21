import React, { useState, useEffect } from 'react';
import { Save } from 'lucide-react';

interface SettingsProps {
    onSave: () => void;
}

export const Settings: React.FC<SettingsProps> = ({ onSave }) => {
    const [region, setRegion] = useState('us-east-1');
    const [apiKey, setApiKey] = useState('');
    const [apiSecret, setApiSecret] = useState('');

    useEffect(() => {
        const savedRegion = localStorage.getItem('region');
        const savedKey = localStorage.getItem('apiKey');
        const savedSecret = localStorage.getItem('apiSecret');
        if (savedRegion) setRegion(savedRegion);
        if (savedKey) setApiKey(savedKey);
        if (savedSecret) setApiSecret(savedSecret);
    }, []);

    const handleSave = () => {
        localStorage.setItem('region', region);
        localStorage.setItem('apiKey', apiKey);
        localStorage.setItem('apiSecret', apiSecret);
        onSave();
    };

    return (
        <div className="flex-1 overflow-auto p-8">
            <div className="max-w-2xl mx-auto">
                <h2 className="text-3xl font-bold mb-2">Settings</h2>
                <p className="text-muted-foreground mb-8">Configure your 8x8 API credentials.</p>

                <div className="bg-card/50 backdrop-blur-sm border border-white/5 rounded-xl p-8 space-y-8">
                    <div className="space-y-3">
                        <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">API Region</label>
                        <select
                            value={region}
                            onChange={(e) => setRegion(e.target.value)}
                            className="w-full p-4 rounded-lg bg-black/40 border border-white/10 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                        >
                            <option value="us-east-1">Rocket API - US East (qm-us-east)</option>
                            <option value="us-west">Rocket API - US West (qm-us-west)</option>
                            <option value="us-west-8x8">Rocket API - US West Legacy (qm-us-phoenix)</option>
                            <option value="uk">Rocket API - UK (qm-uk)</option>
                            <option value="us-west-stats">Stats API - US West (qm-us-phoenix)</option>
                            <option value="us-east-stats">Stats API - US East (qm-us-east)</option>
                        </select>
                    </div>

                    <div className="space-y-3">
                        <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">API Key</label>
                        <input
                            type="text"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="Enter your API Key"
                            className="w-full p-4 rounded-lg bg-black/40 border border-white/10 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                        />
                    </div>

                    <div className="space-y-3">
                        <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">API Secret</label>
                        <input
                            type="password"
                            value={apiSecret}
                            onChange={(e) => setApiSecret(e.target.value)}
                            placeholder="Enter your API Secret"
                            className="w-full p-4 rounded-lg bg-black/40 border border-white/10 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                        />
                    </div>

                    <div className="pt-4">
                        <button
                            onClick={handleSave}
                            className="w-full bg-primary text-black py-4 rounded-lg font-bold hover:brightness-110 transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(0,255,255,0.2)]"
                        >
                            <Save size={18} />
                            Save Configuration
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
