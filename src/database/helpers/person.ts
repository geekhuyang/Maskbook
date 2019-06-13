import { queryPersonDB, PersonRecord, queryPeopleDB, getMyIdentitiesDB } from '../people'
import { PersonIdentifier, Relation } from '../type'
import { getAvatarDataURL } from './avatar'
import { memoize } from 'lodash-es'
import { CryptoKeyToJsonWebKey } from '../../utils/type-transform/CryptoKey-JsonWebKey'
import { encodeArrayBuffer, encodeText } from '../../utils/type-transform/String-ArrayBuffer'

/**
 * Person in UI do not include publickey / privatekey!
 */
export interface Person extends Omit<PersonRecord, 'publicKey' | 'privateKey'> {
    publicKey?: undefined
    privateKey?: undefined
    avatar?: string
    /** Fingerprint for the public key */
    fingerprint?: string
}

export async function personRecordToPerson(record: PersonRecord): Promise<Person> {
    const avatar = await getAvatarDataURL(record.identifier)
    const { privateKey, publicKey, ...rec } = record
    return {
        ...rec,
        avatar,
        fingerprint: record.publicKey ? await calculateFingerprint(record.publicKey) : undefined,
    }
}

/**
 * Query a person even it is not stored in the database.
 * @param identifier - Identifier for people want to query
 */
export async function queryPerson(identifier: PersonIdentifier): Promise<Person> {
    const person = await queryPersonDB(identifier)
    if (!person)
        return {
            identifier,
            groups: [],
            nickname: identifier.userId,
            previousIdentifiers: [],
            relation: [Relation.unknown],
            relationLastCheckTime: new Date(),
            avatar: undefined,
        }
    return personRecordToPerson(person)
}

/**
 * Select a set of people
 */
export async function queryPeopleWithQuery(query: Parameters<typeof queryPeopleDB>[0]): Promise<Person[]> {
    const result = await queryPeopleDB(query)
    return Promise.all(result.map(personRecordToPerson))
}

const calculateFingerprint = memoize(async function(_key: CryptoKey) {
    const key = await CryptoKeyToJsonWebKey(_key)
    if (!key) return 'Fingerprint not available'
    const hash = await crypto.subtle.digest('SHA-256', encodeText(key.x! + key.y))
    return encodeArrayBuffer(hash)
})

/**
 * @deprecated
 */
export async function getMyPrivateKeyAtFacebook(
    whoami: PersonIdentifier = new PersonIdentifier('facebook.com', '$self'),
) {
    const x = await getMyIdentitiesDB()
    const y = x.find(y => y.identifier.network === 'facebook.com' && y.privateKey)
    return y || null
}
