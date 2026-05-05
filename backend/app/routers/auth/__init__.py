from fastapi import APIRouter

from . import _legacy as _legacy_module
from .account import router as account_router
from .eula import router as eula_router
from .account import *  # noqa: F401,F403
from .eula import *  # noqa: F401,F403
from ._legacy import *  # noqa: F401,F403

router = APIRouter()
router.include_router(_legacy_module.router)
router.include_router(eula_router)
router.include_router(account_router)

__all__ = ["router"]
