// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title GoskoPass
/// @notice Neprenosný (soulbound) záznam o účasti a výsledku jazdca v sérii GOSko.
///         Jeden token na jednu registráciu. Na chaine nie sú žiadne osobné údaje,
///         iba náhodný `riderRef`. Systémom záznamu je databáza GOSko.
/// @dev Rozhranie je záväzne opísané v docs/KONTRAKT-REGISTRACIA.md §4.
///      ERC-5192 (Minimal Soulbound NFTs) a ERC-4906 (Metadata Update Extension).
contract GoskoPass is ERC721, AccessControl, Pausable {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    bytes4 private constant _ERC5192_INTERFACE_ID = 0xb45a3c0e; // locked(uint256)
    bytes4 private constant _ERC4906_INTERFACE_ID = 0x49064906;

    /// @dev Kategória: 1 = open, 2 = u16, 3 = women. Zmestí sa do jedného slotu
    ///      spolu s umiestnením, bodmi a príznakom prevzatia.
    struct Pass {
        bytes32 eventId;
        bytes32 riderRef;
        uint8 category;
        uint16 placement;
        uint16 points;
        bool claimed;
    }

    /// @notice registrationKey => tokenId (0 = token neexistuje).
    mapping(bytes32 registrationKey => uint256 tokenId) public tokenOfRegistration;

    mapping(uint256 tokenId => Pass) private _passes;
    mapping(uint256 tokenId => bytes32 registrationKey) private _registrationOf;
    uint256 private _lastTokenId;
    string private _baseTokenURI;

    /// @dev Zapnuté len počas `claim`, jediného povoleného prevodu. Transient:
    ///      po transakcii sa samo vynuluje.
    bool private transient _claiming;

    event Minted(uint256 indexed tokenId, bytes32 indexed registrationKey, bytes32 indexed eventId);
    event ResultSet(uint256 indexed tokenId, uint16 placement, uint16 points);
    event Claimed(uint256 indexed tokenId, address to);
    /// @dev ERC-5192
    event Locked(uint256 tokenId);
    /// @dev ERC-4906
    event MetadataUpdate(uint256 _tokenId);
    /// @dev ERC-4906
    event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId);

    error AlreadyMinted();
    error AlreadyClaimed();
    error Soulbound();
    error InvalidCategory();
    error UnknownToken();

    constructor(address admin, address minter, string memory baseURI) ERC721("GOSko Pass", "GOSKO") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, minter);
        _baseTokenURI = baseURI;
    }

    // ---------------------------------------------------------------- minter

    /// @notice Vydá pass pre registráciu. Ten istý `registrationKey` sa nedá zmintovať dvakrát.
    function mint(address to, bytes32 registrationKey, bytes32 eventId, bytes32 riderRef, uint8 category)
        external
        onlyRole(MINTER_ROLE)
        whenNotPaused
        returns (uint256 tokenId)
    {
        if (category == 0 || category > 3) revert InvalidCategory();
        if (tokenOfRegistration[registrationKey] != 0) revert AlreadyMinted();

        tokenId = ++_lastTokenId;
        tokenOfRegistration[registrationKey] = tokenId;
        _registrationOf[tokenId] = registrationKey;
        _passes[tokenId] = Pass({
            eventId: eventId,
            riderRef: riderRef,
            category: category,
            placement: 0,
            points: 0,
            claimed: false
        });

        _mint(to, tokenId);
        emit Minted(tokenId, registrationKey, eventId);
        emit Locked(tokenId);
    }

    /// @notice Zapíše (alebo opraví) umiestnenie a body.
    function setResult(uint256 tokenId, uint16 placement, uint16 points)
        external
        onlyRole(MINTER_ROLE)
        whenNotPaused
    {
        Pass storage pass = _existingPass(tokenId);
        pass.placement = placement;
        pass.points = points;
        emit ResultSet(tokenId, placement, points);
        emit MetadataUpdate(tokenId);
    }

    /// @notice Spáli token a uvoľní `registrationKey`. Funguje aj počas pauzy.
    function revoke(uint256 tokenId) external onlyRole(MINTER_ROLE) {
        _existingPass(tokenId);
        delete tokenOfRegistration[_registrationOf[tokenId]];
        delete _registrationOf[tokenId];
        delete _passes[tokenId];
        _burn(tokenId);
    }

    /// @notice Jednorazový presun z custody do peňaženky jazdca. Potom je token znova zamknutý.
    function claim(uint256 tokenId, address to) external onlyRole(MINTER_ROLE) whenNotPaused {
        Pass storage pass = _existingPass(tokenId);
        if (pass.claimed) revert AlreadyClaimed();
        pass.claimed = true;

        // Zámerne `_transfer`, nie `_safeTransfer`: bez callbacku onERC721Received
        // nemôže príjemca počas otvoreného `_claiming` poslať token ďalej.
        _claiming = true;
        _transfer(_ownerOf(tokenId), to, tokenId);
        _claiming = false;

        emit Claimed(tokenId, to);
    }

    // ----------------------------------------------------------------- admin

    function setBaseURI(string calldata uri) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _baseTokenURI = uri;
        emit BatchMetadataUpdate(1, type(uint256).max);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ------------------------------------------------------------------ view

    function passOf(uint256 tokenId) external view returns (Pass memory) {
        return _existingPass(tokenId);
    }

    /// @notice ERC-5192: každý existujúci pass je vždy zamknutý.
    function locked(uint256 tokenId) external view returns (bool) {
        _existingPass(tokenId);
        return true;
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, AccessControl) returns (bool) {
        return interfaceId == _ERC5192_INTERFACE_ID || interfaceId == _ERC4906_INTERFACE_ID
            || super.supportsInterface(interfaceId);
    }

    // -------------------------------------------------------------- internal

    function _existingPass(uint256 tokenId) private view returns (Pass storage) {
        if (_ownerOf(tokenId) == address(0)) revert UnknownToken();
        return _passes[tokenId];
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    /// @dev Jediné miesto, cez ktoré idú všetky zmeny vlastníctva. Povolené sú
    ///      mint (from = 0), burn (to = 0) a prebiehajúci `claim`. Všetko ostatné
    ///      (transferFrom, safeTransferFrom, aj cez approve) revertuje.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0) && !_claiming) revert Soulbound();
        return super._update(to, tokenId, auth);
    }
}
