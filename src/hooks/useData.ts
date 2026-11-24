import { useQuery } from '@tanstack/react-query';
import { get } from '../lib/api';

export const useChurches = () => useQuery({ queryKey: ['churches'], queryFn: () => get<{ items: any[] }>('/churches').then((r) => r.items) });
export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: () => get<any>('/settings') });
