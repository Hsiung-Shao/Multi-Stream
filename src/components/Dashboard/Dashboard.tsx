


import { WelcomeHeader } from './WelcomeHeader';
import { QuickAddWidget } from './QuickAddWidget';
import { FavoritesWidget } from './FavoritesWidget';
import { ActiveStreamsWidget } from './ActiveStreamsWidget';
import { VersionUpdatesWidget } from './VersionUpdatesWidget';

export const Dashboard = () => {
    return (
        <div className="w-full h-full animate-in fade-in zoom-in-95 duration-500">
            {/* Header Section */}
            <div className="mb-8">
                <WelcomeHeader />
            </div>

            {/* Grid Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-8">

                {/* Left Column: Side Widgets (3 cols) */}
                <div className="lg:col-span-3 flex flex-col gap-6">
                    {/* Quick Add */}
                    <div className="h-auto">
                        <QuickAddWidget />
                    </div>

                    {/* Version Updates */}
                    <div className="h-[280px]">
                        <VersionUpdatesWidget />
                    </div>
                </div>

                {/* Right Column: Main Content (9 cols) */}
                <div className="lg:col-span-9">
                    {/* Active Streams & Favorites - Equal width and height */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-[600px]">
                        <div className="h-[95%]">
                            <ActiveStreamsWidget />
                        </div>
                        <div className="h-[95%]">
                            <FavoritesWidget />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
