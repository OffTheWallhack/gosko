// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title GoskoLoot
/// @notice Neprenosné (soulbound) ERC-1155 odmeny z hry Ghoskate. Jeden claim z databázy
///         (`loot_claims.id`) vydá práve jeden kus. Na chaine nie sú žiadne osobné údaje,
///         iba `claimRef` = keccak256(utf8(loot_claims.id)). Systémom záznamu je databáza GOSko.
/// @dev Typy tokenov (id): 1 ghost drop, 2 park pass, 3 trick card, 4 crew/founder,
///      5 partner stamp. Ďalšie typy povoľuje admin cez `setTypeEnabled`.
///      ERC-5192 (Minimal Soulbound NFTs): `locked` je vždy `true`.
contract GoskoLoot is ERC1155, AccessControl, Pausable {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    bytes4 private constant _ERC5192_INTERFACE_ID = 0xb45a3c0e; // locked(uint256)

    string public constant name = "GOSko Loot";
    string public constant symbol = "GLOOT";

    /// @notice id typu => smie sa mintovať.
    mapping(uint256 id => bool enabled) public typeEnabled;

    /// @notice claimRef => id typu (0 = claim nie je zmintovaný).
    mapping(bytes32 claimRef => uint256 id) public typeOfClaim;

    /// @notice claimRef => adresa, ktorej bol kus vydaný (0 = claim nie je zmintovaný).
    mapping(bytes32 claimRef => address holder) public holderOfClaim;

    event LootMinted(address indexed to, uint256 indexed id, bytes32 indexed claimRef);
    event LootRevoked(address indexed holder, uint256 indexed id, bytes32 indexed claimRef);
    event TypeEnabledSet(uint256 indexed id, bool enabled);
    /// @dev ERC-4906 (podoba pre kolekciu): metadáta všetkých typov sa zmenili.
    ///      Pre ERC-1155 nie je štandardizované, preto aj štandardné `URI` nenesieme.
    event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId);

    error AlreadyMinted();
    error UnknownClaim();
    error TypeDisabled();
    error ZeroAddress();
    error Soulbound();

    /// @param admin DEFAULT_ADMIN_ROLE (pauza, typy, URI).
    /// @param minter MINTER_ROLE (server: mint a revoke).
    /// @param uri_ šablóna ERC-1155 s `{id}`, napr. https://gosko-master.vercel.app/api/nft/loot/{id}
    constructor(address admin, address minter, string memory uri_) ERC1155(uri_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, minter);
        for (uint256 id = 1; id <= 5; id++) {
            typeEnabled[id] = true;
            emit TypeEnabledSet(id, true);
        }
    }

    // ------------------------------------------------------------------ mint

    /// @notice Vydá 1 kus typu `id` na `to`. Jeden `claimRef` = jeden mint.
    function mint(address to, uint256 id, bytes32 claimRef) external onlyRole(MINTER_ROLE) whenNotPaused {
        if (to == address(0)) revert ZeroAddress();
        if (!typeEnabled[id]) revert TypeDisabled();
        if (holderOfClaim[claimRef] != address(0)) revert AlreadyMinted();

        typeOfClaim[claimRef] = id;
        holderOfClaim[claimRef] = to;
        _mint(to, id, 1, "");
        emit LootMinted(to, id, claimRef);
    }

    /// @notice Spáli kus daného claimu a uvoľní `claimRef` (dá sa znova mintnúť).
    ///         Funguje aj počas pauzy. Ak si držiteľ kus už spálil sám (`burn`),
    ///         claim sa len uvoľní.
    function revoke(bytes32 claimRef) external onlyRole(MINTER_ROLE) {
        address holder = holderOfClaim[claimRef];
        if (holder == address(0)) revert UnknownClaim();
        uint256 id = typeOfClaim[claimRef];
        delete holderOfClaim[claimRef];
        delete typeOfClaim[claimRef];
        if (balanceOf(holder, id) > 0) _burn(holder, id, 1);
        emit LootRevoked(holder, id, claimRef);
    }

    /// @notice Právo na výmaz: držiteľ si sám spáli jeden svoj kus typu `id`.
    ///         `claimRef` zostáva obsadený, kus sa teda nedá vydať znova bez `revoke`.
    function burn(uint256 id) external {
        _burn(msg.sender, id, 1);
    }

    // ----------------------------------------------------------------- admin

    /// @notice Povolí alebo zakáže mint typu `id`. Typy 1 až 5 sú povolené od nasadenia.
    function setTypeEnabled(uint256 id, bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        typeEnabled[id] = enabled;
        emit TypeEnabledSet(id, enabled);
    }

    /// @notice Nová šablóna URI (s `{id}`). Emituje `BatchMetadataUpdate(0, max)`,
    ///         aby marketplace a exploreri načítali metadáta znova.
    function setURI(string calldata newuri) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setURI(newuri);
        emit BatchMetadataUpdate(0, type(uint256).max);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ------------------------------------------------------------------ view

    /// @notice ERC-5192: každý kus je vždy zamknutý.
    function locked(uint256) external pure returns (bool) {
        return true;
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC1155, AccessControl) returns (bool) {
        return interfaceId == _ERC5192_INTERFACE_ID || super.supportsInterface(interfaceId);
    }

    // -------------------------------------------------------------- internal

    /// @dev Prevod medzi dvoma nenulovými adresami je zakázaný (mint a burn prejdú).
    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal
        override
    {
        if (from != address(0) && to != address(0)) revert Soulbound();
        super._update(from, to, ids, values);
    }

    /// @dev Súhlas na správu kusov nemá zmysel, keď sa nedajú previesť.
    function setApprovalForAll(address, bool) public pure override {
        revert Soulbound();
    }
}
