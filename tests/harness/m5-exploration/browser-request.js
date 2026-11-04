export function browserRequestIsCurrent({ dialogOpen, request, currentRequest, session, dataset, sequence, currentSequence, currentSession, currentDataset, dialogOwns }) {
  return Boolean(dialogOpen
    && request === currentRequest
    && session === currentSession
    && dataset === currentDataset
    && sequence === currentSequence
    && dialogOwns);
}
