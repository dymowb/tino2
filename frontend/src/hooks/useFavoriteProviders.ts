import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import { useTranslation } from "react-i18next";
import apiService, { FavoriteProvider } from "../services/api";

export const FAVORITES_QUERY_KEY = ["favorite-providers"] as const;

export function useFavoriteProviders(enabled = true) {
  const queryClient = useQueryClient();
  const { t } = useTranslation("providers");
  const query = useQuery({
    queryKey: FAVORITES_QUERY_KEY,
    queryFn: () => apiService.getFavoriteProviders(),
    enabled,
  });

  const mutation = useMutation({
    mutationFn: ({
      providerId,
      saved,
    }: {
      providerId: string;
      saved: boolean;
    }) =>
      saved
        ? apiService.removeFavoriteProvider(providerId)
        : apiService.addFavoriteProvider(providerId),
    onMutate: async ({ providerId, saved }) => {
      await queryClient.cancelQueries({ queryKey: FAVORITES_QUERY_KEY });
      const previous =
        queryClient.getQueryData<FavoriteProvider[]>(FAVORITES_QUERY_KEY) || [];
      if (saved) {
        queryClient.setQueryData<FavoriteProvider[]>(
          FAVORITES_QUERY_KEY,
          previous.filter((favorite) => favorite.providerId !== providerId),
        );
      }
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous)
        queryClient.setQueryData(FAVORITES_QUERY_KEY, context.previous);
      toast.error(t("favorites.update_error"));
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: FAVORITES_QUERY_KEY }),
  });

  const favorites = query.data || [];
  const savedIds = new Set(favorites.map((favorite) => favorite.providerId));
  return {
    ...query,
    favorites,
    savedIds,
    toggle: mutation.mutate,
    isUpdating: mutation.isPending,
  };
}
