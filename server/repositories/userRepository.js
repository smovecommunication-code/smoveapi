const { MemoryAuthRepository } = require('./authRepository.memory');

class UserRepository extends MemoryAuthRepository {}

module.exports = { UserRepository, MemoryAuthRepository };
