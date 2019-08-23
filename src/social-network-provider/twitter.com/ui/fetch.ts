import {
    bioCard,
    fromPostSelectorsSelectPostContentString,
    postPopupSelector,
    postsContentSelectors,
    postsRootSelector,
    postsSelectors,
    selfInfoSelectors,
} from '../utils/selector'
import { MutationObserverWatcher } from '@holoflows/kit'
import Services from '../../../extension/service'
import { PersonIdentifier } from '../../../database/type'
import { host } from '../index'
import { getEmptyPostInfo, SocialNetworkUI } from '../../../social-network/ui'
import { deconstructPayload } from '../../../utils/type-transform/Payload'
import { regexMatch, timeout } from '../../../utils/utils'
import { hasPostPopup } from '../utils/status'
import { equal, notEmpty } from '../../../utils/assert'

export const resolveLastRecognizedIdentity = (self: SocialNetworkUI) => {
    const selfSelector = selfInfoSelectors.screenName
    const assign = () => {
        const ref = self.lastRecognizedIdentity
        const info = selfInfoSelectors.screenName.evaluateOnce()
        const id = new PersonIdentifier(host, notEmpty(info, 'user id not found')[0])
        equal(id.isUnknown, false, 'user id not recognized')
        ref.value = { identifier: id }
    }
    new MutationObserverWatcher(selfSelector)
        .enableSingleMode()
        .addListener('onAdd', () => assign())
        .addListener('onChange', () => assign())
        .startWatch()
        .then()
}

export const resolveInfoFromBioCard = () => {
    const userAvatarUrl = bioCard
        .nth(0)
        .querySelector<HTMLImageElement>('img')
        .evaluateOnce()[0].src
    const userNames = bioCard
        .nth(1)
        .evaluateOnce()[0]
        .innerText.split('\n')
    const userBio = bioCard.nth(2).evaluateOnce()[0].innerText
    return {
        userAvatarUrl,
        userName: userNames[0],
        userScreenName: userNames[1],
        userBio,
    }
}

const registerBioCollector = () => {
    // This object will not be garbage collected
    new MutationObserverWatcher(bioCard)
        .enableSingleMode()
        .useForeach(node => {
            const refreshUserInfo = () => {
                const r = resolveInfoFromBioCard()
                const text = node.innerText
                const p = new PersonIdentifier(host, r.userScreenName)
                Services.Crypto.verifyOthersProve(text, p).then()
                Services.People.updatePersonInfo(p, {
                    nickname: r.userName,
                    avatarURL: r.userAvatarUrl,
                }).then()
            }
            refreshUserInfo()
            return {
                onNodeMutation: refreshUserInfo,
                onTargetChanged: refreshUserInfo,
            }
        })
        .startWatch()
        .then()
}

const resolveInfoFromPostView = (node: HTMLElement) => {
    const r = node.querySelector(fromPostSelectorsSelectPostContentString)
    if (!r) return null
    const c = r.children
    const postId = regexMatch(c[0].querySelectorAll('a')[1].href, /(status\/)(\d*)/, 1)
    const postBy = c[0].querySelectorAll('span')[3].innerText.replace('@', '')
    const postContent = (c[1] as HTMLElement).innerText
    return {
        postId,
        postBy,
        postContent,
    }
}

const registerPostCollector = (that: SocialNetworkUI) => {
    new MutationObserverWatcher(postsSelectors)
        .useForeach((node, _, proxy) => {
            const info = getEmptyPostInfo(postsRootSelector)
            that.posts.set(proxy, info)
            const collectPostInfo = () => {
                const r = resolveInfoFromPostView(node)
                if (!r) return
                info.postContent.value = r.postContent
                info.postPayload.value = deconstructPayload(info.postContent.value)
                info.postBy.value = new PersonIdentifier(host, r.postBy)
                info.postID.value = r.postId
            }
            collectPostInfo()
            return {
                onNodeMutation: collectPostInfo,
                onTargetChanged: collectPostInfo,
                onRemove: () => that.posts.delete(proxy),
            }
        })
        .setDomProxyOption({ afterShadowRootInit: { mode: 'closed' } })
        .startWatch()
        .then()
}

/**
 * This can be help to make sure if bioCard exists on the page.
 * @throws exception if not exist
 * @return bioCard element, if exists
 */
export const fetchBioCard = async () => {
    return (await timeout(new MutationObserverWatcher(bioCard), 10000))[0]
}

export const fetchPost = async () => {
    const s = hasPostPopup() ? postPopupSelector.concat(postsContentSelectors) : postsContentSelectors
    return (await timeout(new MutationObserverWatcher(s), 10000))[0]
}

export { registerBioCollector as collectPeople, registerPostCollector as collectPosts }
