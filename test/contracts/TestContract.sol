pragma solidity ^ 0.6;

import "./RelativeImport.sol";

contract TestContract {
    bytes32 immutable private _myImmutable = bytes32(uint256(100));

    function foo() external view returns (bytes32) {
        return _myImmutable;
    }
}
