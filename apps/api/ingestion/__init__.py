"""Ingesta de datos de Cuadra (orquestación Dagster) — módulo top-level, PROCESO aparte.

Consume los contextos de negocio SOLO por sus puertos/use cases (ADR 33). Dagster vive en el
dependency-group `ingestion` (no en el runtime de la API). Microservices-ready: extraíble a
`apps/ingestion` sin reescritura. Ver docs/research/save-fable/06-pilar2-plataforma-paneles.md §8.
"""
