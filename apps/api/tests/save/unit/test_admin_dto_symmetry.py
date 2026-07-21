"""GUARDA DE CONTRATO — un campo que la API acepta ESCRIBIR debe poder LEERSE.

Nace de un bug real (2026-07-20): `PolicyModal` editaba `priority`, que `UpdatePolicyRequest` acepta
pero `PolicyDto` **no expone**. El formulario lo leía con un cast, obtenía siempre `undefined`, el
input nacía vacío y cada guardado pisaba la prioridad con `null`. No fallaba en ningún punto: mentía
coherentemente, porque un campo vacío parece el estado real.

La asimetría escritura/lectura es la CAUSA, y es invisible en el borde: cada DTO por separado se ve
perfectamente sensato. Solo se ve comparándolos, que es lo que hace este test.

No prohíbe la asimetría — la vuelve DELIBERADA. Un campo write-only tiene que declararse acá con su
motivo, y entonces el front sabe que no puede round-tripearlo.
"""
from __future__ import annotations

import pytest

from src.api.v1.controllers.admin_orchestration import PolicyDto, UpdatePolicyRequest

# Campos que se pueden ESCRIBIR pero deliberadamente no se devuelven, con su razón.
# Vacío a propósito: hoy no hay ninguno legítimo.
#
# ⚠️ Antes de agregar acá: si el front tiene que EDITARLO, no es write-only — es un hueco en el DTO de
# lectura, y taparlo con esta lista reintroduce el bug de `priority`. Un write-only real es algo que
# se manda y nunca se vuelve a mostrar (un secreto, una contraseña), no algo que el operador ajusta.
WRITE_ONLY: dict[type, dict[str, str]] = {}

# Pares (request de escritura, DTO de lectura) del admin. Agregar el par al sumar una pantalla que
# edite: es una línea, y compra la clase entera de bug.
PAIRS = [(UpdatePolicyRequest, PolicyDto)]


@pytest.mark.parametrize(("write_model", "read_model"), PAIRS)
def test_every_writable_field_can_also_be_read(write_model, read_model) -> None:  # type: ignore[no-untyped-def]
    writable = set(write_model.model_fields)
    readable = set(read_model.model_fields)
    declared_write_only = set(WRITE_ONLY.get(write_model, {}))

    invisible = writable - readable - declared_write_only

    assert not invisible, (
        f"{write_model.__name__} acepta {sorted(invisible)}, que {read_model.__name__} NO devuelve.\n"
        "Un form que edite esos campos no puede conocer su valor actual: nace vacío y cada guardado "
        "los pisa en silencio (fue exactamente el bug de `priority`).\n"
        "O se exponen en el DTO de lectura, o se declaran en WRITE_ONLY con su motivo."
    )


def test_the_write_only_allowlist_only_names_fields_that_exist() -> None:
    """Una entrada obsoleta en la lista silenciaría un campo NUEVO que se llamara igual. Si el campo
    ya no existe, la excepción tampoco debe."""
    for write_model, entries in WRITE_ONLY.items():
        unknown = set(entries) - set(write_model.model_fields)
        assert not unknown, f"WRITE_ONLY[{write_model.__name__}] nombra campos inexistentes: {unknown}"
