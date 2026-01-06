import { useState, useEffect, useMemo, useCallback } from 'react';
import { favoritesService } from '../features/favorites/FavoritesService';
import { FavoriteStream, FavoriteCategory } from '../features/favorites/types';

export const useFavorites = () => {
    const [favorites, setFavorites] = useState<FavoriteStream[]>(favoritesService.getFavorites());
    const [categories, setCategories] = useState<FavoriteCategory[]>(favoritesService.getCategories());

    // We can also track a timestamp to force updates if needed
    const [lastUpdated, setLastUpdated] = useState(Date.now());

    useEffect(() => {
        const handleUpdates = () => {
            setFavorites(favoritesService.getFavorites());
            setCategories(favoritesService.getCategories());
            setLastUpdated(Date.now());
        };

        // Initial load
        handleUpdates();

        // Listen for updates
        window.addEventListener('favoritesUpdated', handleUpdates);
        window.addEventListener('categoriesUpdated', handleUpdates); // Assuming categories emit this

        return () => {
            window.removeEventListener('favoritesUpdated', handleUpdates);
            window.removeEventListener('categoriesUpdated', handleUpdates);
        };
    }, []);

    const liveFavorites = useMemo(() => {
        return favorites.filter(f => f.isLive);
    }, [favorites]);

    // Function to manually trigger a refresh of the data from service
    // (Useful if the service updates without emitting an event, though it should emit)
    const refresh = useCallback(() => {
        setFavorites(favoritesService.getFavorites());
        setCategories(favoritesService.getCategories());
    }, []);

    return {
        favorites,
        liveFavorites,
        categories,
        lastUpdated,
        refresh
    };
};
