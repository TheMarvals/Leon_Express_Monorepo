# 1) Borrar paquetes anteriores (opcional)
docker exec leonexpress_backend mariadb \
  -h mysql -u marval -p"ThomasMarval2105.." --skip-ssl \
  leon_express \
  -e "DELETE FROM packages WHERE external_tracking_code IN ('46888855687','46889370798','46889499716','46888288061');"

# 2) Resetear el pickup a asignado
docker exec leonexpress_backend mariadb \
  -h mysql -u marval -p"ThomasMarval2105.." --skip-ssl \
  leon_express \
  -e "UPDATE pickups SET status = 'ASIGNADO_A_RECOLECTOR' WHERE pickup_id = '0e2a9fc7-c389-4af6-9c5e-3a2a52270db0';"

UPDATE ml_shipments 
SET import_status = 'pending', imported_by_app = NULL, imported_at = NULL, import_reference_id = NULL 
WHERE ml_shipment_external_id IN (46888855687, 46889370798, 46889499716, 46888288061);