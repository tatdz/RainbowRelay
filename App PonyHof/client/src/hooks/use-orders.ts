import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useWallet } from "./use-wallet";
import type { Order } from "@shared/schema";

export function useOrders() {
  const { address } = useWallet();
  const queryClient = useQueryClient();

  const {
    data: userOrders = [],
    isLoading: isLoadingUserOrders,
    error: userOrdersError,
  } = useQuery({
    queryKey: ["/api/orders/user", address],
    enabled: !!address,
    refetchInterval: 5000,
  });

  const {
    data: activeOrders = [],
    isLoading: isLoadingActiveOrders,
  } = useQuery({
    queryKey: ["/api/orders/active"],
    refetchInterval: 5000,
  });

  const createOrderMutation = useMutation({
    mutationFn: (orderData: any) => apiRequest("POST", "/api/orders", orderData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/network/activity"] });
    },
  });

  const cancelOrderMutation = useMutation({
    mutationFn: (orderId: string) => apiRequest("DELETE", `/api/orders/${orderId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/network/activity"] });
    },
  });

  return {
    userOrders,
    activeOrders,
    isLoadingUserOrders,
    isLoadingActiveOrders,
    userOrdersError,
    createOrder: createOrderMutation.mutate,
    cancelOrder: cancelOrderMutation.mutate,
    isCreatingOrder: createOrderMutation.isPending,
    isCancellingOrder: cancelOrderMutation.isPending,
  };
}
