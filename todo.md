# Sistema Forense de Huellas Dactilares IA - TODO

## Base de Datos
- [x] Crear tabla de casos (cases)
- [x] Crear tabla de muestras (samples)
- [x] Crear tabla de historial de procesamiento (processingHistory)
- [x] Crear tabla de análisis de calidad (qualityAnalysis)
- [x] Migrar esquema a la base de datos

## API (tRPC Routers)
- [x] Implementar router de casos (crear, listar, actualizar)
- [x] Implementar router de muestras (crear, listar, actualizar)
- [x] Implementar router de texturización (applyTexture, uploadImage)
- [x] Implementar router de historial (getHistory, getHistoryItem)
- [x] Implementar router de análisis de calidad (getAnalysis)
- [x] Integrar LLM para análisis forense

## Interfaz de Usuario
- [x] Página de inicio con navegación
- [x] Componente de carga de imágenes
- [x] Componente de comparación de imágenes (original vs procesada)
- [ ] Panel de gestión de casos
- [x] Panel de historial de procesamientos
- [x] Panel de métricas de calidad
- [x] Visualización de análisis forense

## Autenticación y Usuarios
- [x] Integrar autenticación de Manus OAuth
- [ ] Crear dashboard de usuario
- [x] Implementar gestión de roles (admin/usuario)
- [ ] Crear página de perfil de usuario

## Pruebas
- [ ] Escribir pruebas para uploadImage
- [ ] Escribir pruebas para applyTexture
- [ ] Escribir pruebas para getHistory
- [ ] Escribir pruebas para análisis de calidad

## Despliegue
- [x] Construir aplicación para producción
- [x] Configurar variables de entorno
- [ ] Crear checkpoint inicial
- [x] Exponer la aplicación permanentemente
