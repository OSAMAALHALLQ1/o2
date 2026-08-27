import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  CompanionActionResponseDto,
  CompanionCareActionType,
  CompanionCareStateDto,
  CompanionReaction,
} from '@o2/types';
import { CompanionApi } from '../api/companion';
import { useAuth } from './AuthContext';

interface CompanionContextType {
  companionState: CompanionCareStateDto | null;
  isLoading: boolean;
  isActing: boolean;
  activeReaction: CompanionReaction | null;
  refreshCareState: () => Promise<void>;
  performAction: (action: CompanionCareActionType) => Promise<CompanionActionResponseDto | null>;
}

const CompanionContext = createContext<CompanionContextType | undefined>(undefined);

export const CompanionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { authState, profile } = useAuth();
  const [companionState, setCompanionState] = useState<CompanionCareStateDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isActing, setIsActing] = useState<boolean>(false);
  const [activeReaction, setActiveReaction] = useState<CompanionReaction | null>(null);

  const refreshCareState = useCallback(async () => {
    if (authState !== 'authenticated' || !profile?.isOnboarded) {
      setCompanionState(null);
      return;
    }

    try {
      setIsLoading(true);
      const state = await CompanionApi.getCareState();
      setCompanionState(state);
    } catch (err) {
      console.warn('Failed to fetch companion care state:', err);
    } finally {
      setIsLoading(false);
    }
  }, [authState, profile]);

  useEffect(() => {
    if (authState === 'authenticated' && profile?.isOnboarded) {
      refreshCareState();
    }
  }, [authState, profile, refreshCareState]);

  const performAction = useCallback(
    async (action: CompanionCareActionType): Promise<CompanionActionResponseDto | null> => {
      if (!companionState) return null;

      const clientActionId = `act_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      try {
        setIsActing(true);
        const res = await CompanionApi.performCareAction(action, clientActionId);

        if (res.success && res.state) {
          setCompanionState(res.state);
          setActiveReaction(res.reaction);

          // Clear reaction after 3 seconds
          setTimeout(() => {
            setActiveReaction(null);
          }, 3000);
        }

        return res;
      } catch (err: any) {
        console.error('Care action execution failed:', err);
        throw err;
      } finally {
        setIsActing(false);
      }
    },
    [companionState],
  );

  return (
    <CompanionContext.Provider
      value={{
        companionState,
        isLoading,
        isActing,
        activeReaction,
        refreshCareState,
        performAction,
      }}
    >
      {children}
    </CompanionContext.Provider>
  );
};

export const useCompanion = (): CompanionContextType => {
  const context = useContext(CompanionContext);
  if (!context) {
    throw new Error('useCompanion must be used within a CompanionProvider');
  }
  return context;
};
